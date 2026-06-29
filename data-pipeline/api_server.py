"""
api_server.py — FastAPI 应用：港口查询、HS 编码查询、运费估算、合规扫描、单证生成、货物追踪
"""

from __future__ import annotations

import json
import os
import re
import sys
import io
from pathlib import Path
import uuid
from typing import Optional
from datetime import date, datetime, timezone

from fastapi import FastAPI, Query, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field

# ── 确保能导入同级模块 ──────────────────────────────────────────────
sys.path.insert(0, str(Path(__file__).resolve().parent))

from auth import (
    UserCreate,
    UserLogin,
    TokenResponse,
    create_user,
    user_to_public,
    get_current_user,
    get_current_user_required,
    create_access_token,   # 用于直接在路由中签发 token
    # 用户设置
    UserSettingsPublic,
    UserSettingsUpdate,
    get_user_settings,
    update_user_settings,
    # API Key
    create_api_key_for_user,
    list_api_keys_for_user,
    delete_api_key_for_user,
)
from freight_estimator import estimate_freight
from tracking_models import (
    Shipment,
    TrackingEvent,
    ShipmentTrackingResponse,
    get_mock_shipment,
    get_mock_shipments_list,
)

# ── 数据目录 ────────────────────────────────────────────────────────
OUTPUT_DIR = Path(__file__).resolve().parent / "output"

# ── 应用实例 ────────────────────────────────────────────────────────
app = FastAPI(
    title="LogiBridge API",
    description="港口搜索 · HS 编码搜索 · 海运运费估算 · 合规扫描 · 单证生成",
    version="1.0.0",
)

# ── CORS ────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── 内存数据 ────────────────────────────────────────────────────────
PORTS: list[dict] = []
PORTS_BY_CODE: dict[str, dict] = {}  # code -> port, 快速查找
HS_CODES: list[dict] = []
COMPLIANCE: dict = {}  # { country_code: TradeComplianceRules }

# ── 请求 / 响应模型 ────────────────────────────────────────────────


class FreightEstimateRequest(BaseModel):
    origin: str = Field(..., description="起运港代码，如 CNSHA")
    destination: str = Field(..., description="目的港代码，如 USLAX")
    containerType: str = Field(..., description="集装箱类型: 20GP / 40GP / 40HQ")


class FreightEstimateResponse(BaseModel):
    base_freight: float
    baf: float
    lsf: float
    congestion_surcharge: float
    total: float


class ComplianceScanRequest(BaseModel):
    hsCode: str = Field(..., description="商品 HS 编码（前 4-6 位）")
    originCountry: str = Field(..., description="原产国 ISO 代码")
    destCountry: str = Field(..., description="目的国 ISO 代码")
    cargoValue: float = Field(..., description="货值 USD")
    incoterm: str = Field("FOB", description="贸易术语")


class DocGenerateRequest(BaseModel):
    docType: str = Field(..., description="单证类型: bill_of_lading / commercial_invoice / packing_list / certificate_of_origin")
    fields: dict = Field(..., description="表单字段键值对")


# ── 工具函数 ────────────────────────────────────────────────────────


def hs_matches_pattern(hs_code: str, pattern: str) -> bool:
    """
    检查 HS 编码是否匹配某个正则/通配模式。
    支持: ".*" 全匹配, "85.*" 前2位, "8504" 前4位, "850440" 前6位, "84.*|85.*" 或集
    """
    if pattern == ".*":
        return True
    # 处理或集: "84.*|85.*"
    for sub in pattern.split("|"):
        sub = sub.strip()
        if sub == ".*":
            return True
        if sub.endswith(".*"):
            prefix = sub[:-2]
            if hs_code.startswith(prefix):
                return True
        else:
            if hs_code.startswith(sub):
                return True
    return False


def find_matching_tariffs(hs_code: str, rules: dict) -> list[dict]:
    """查找 matching additional_tariffs"""
    return [t for t in rules.get("additional_tariffs", []) if hs_matches_pattern(hs_code, t["hs_pattern"])]


def find_matching_anti_dumping(hs_code: str, rules: dict) -> list[dict]:
    """查找 matching anti_dumping"""
    matched = []
    for ad in rules.get("anti_dumping", []):
        if hs_matches_pattern(hs_code, ad["hs_range"]):
            matched.append(ad)
    return matched


def find_matching_certs(hs_code: str, rules: dict) -> list[dict]:
    """查找适用的认证要求"""
    return [c for c in rules.get("required_certs", []) if hs_matches_pattern(hs_code, c.get("applies_to_hs_pattern", ".*"))]


# ── 启动事件 ────────────────────────────────────────────────────────


@app.on_event("startup")
def load_data():
    global PORTS, HS_CODES, COMPLIANCE

    ports_path = OUTPUT_DIR / "ports.json"
    hscodes_path = OUTPUT_DIR / "hs_codes.json"
    compl_path = OUTPUT_DIR / "compliance_rules.json"

    if ports_path.exists():
        with open(ports_path, "r", encoding="utf-8") as f:
            PORTS = json.load(f)
        PORTS_BY_CODE.clear()
        for p in PORTS:
            code = p.get("code", "")
            if code and code not in PORTS_BY_CODE:
                PORTS_BY_CODE[code] = p
        print(f"[启动] 加载港口数据: {len(PORTS)} 条, {len(PORTS_BY_CODE)} 个代码索引")
    else:
        print(f"[启动] 警告: {ports_path} 不存在")

    if hscodes_path.exists():
        with open(hscodes_path, "r", encoding="utf-8") as f:
            HS_CODES = json.load(f)
        print(f"[启动] 加载 HS 编码数据: {len(HS_CODES)} 条")
    else:
        print(f"[启动] 警告: {hscodes_path} 不存在")

    if compl_path.exists():
        with open(compl_path, "r", encoding="utf-8") as f:
            COMPLIANCE = json.load(f)
        print(f"[启动] 加载合规规则: {len(COMPLIANCE.get('rules',{}))} 个国家")
    else:
        print(f"[启动] 警告: {compl_path} 不存在")


# ── 接口：港口搜索 ────────────────────────────────────────────────


@app.get("/api/port/search")
def search_port(
    q: str = Query("", min_length=0),
    limit: int = Query(15, ge=1, le=100),
):
    if not q.strip():
        return PORTS[:limit]
    q_lower = q.strip().lower()

    def match(port: dict) -> bool:
        return q_lower in port.get("code", "").lower() or q_lower in port.get("name", "").lower()

    def sort_key(port: dict) -> tuple:
        code = port.get("code", "").lower()
        name = port.get("name", "").lower()
        code_starts = not code.startswith(q_lower)
        name_starts = not name.startswith(q_lower)
        code_contains = not (q_lower in code and not code_starts)
        name_contains = not (q_lower in name and not name_starts)
        return (code_starts, name_starts, code_contains, name_contains, name)

    results = [p for p in PORTS if match(p)]
    results.sort(key=sort_key)
    return results[:limit]


# ── 接口：HS 编码搜索 ────────────────────────────────────────────


@app.get("/api/hscode/search")
def search_hscode(
    q: str = Query("", min_length=0),
    limit: int = Query(15, ge=1, le=100),
):
    if not q.strip():
        return HS_CODES[:limit]
    q_lower = q.strip().lower()

    def match(hs: dict) -> bool:
        return q_lower in hs.get("code", "").lower() or q_lower in hs.get("description", "").lower()

    results = [h for h in HS_CODES if match(h)]
    return results[:limit]


# ── 接口：运费估算 ────────────────────────────────────────────────


@app.post("/api/freight/estimate", response_model=FreightEstimateResponse)
def freight_estimate(req: FreightEstimateRequest):
    try:
        return estimate_freight(req.origin, req.destination, req.containerType)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"内部错误: {e}")


# ═══════════════════════════════════════════════════════════════════════
#  接口：合规扫描  POST /api/compliance/scan
# ═══════════════════════════════════════════════════════════════════════


@app.post("/api/compliance/scan")
def compliance_scan(req: ComplianceScanRequest):
    rules = COMPLIANCE.get("rules", {})
    dest_rules = rules.get(req.destCountry.upper())

    if not dest_rules:
        raise HTTPException(status_code=404, detail=f"未找到 {req.destCountry} 的合规规则")

    hs = req.hsCode.strip()
    value = req.cargoValue
    incoterm = req.incoterm.upper()

    # ── 1. 风险清单 ──────────────────────────────────────────────
    risks: list[dict] = []

    # 反倾销风险
    ad_matches = find_matching_anti_dumping(hs, dest_rules)
    for ad in ad_matches:
        rate_str = f"{ad['duty_rate']}%" if ad['duty_rate'] > 0 else "调查中"
        risks.append({
            "type": "anti_dumping",
            "level": "high",
            "description": f"该商品被征收反倾销税，税率 {rate_str}，状态：{ad['status']}",
            "rate": rate_str,
            "product": ad.get("product", ""),
        })

    # 额外关税风险（非反倾销的 301/232 等）
    tariff_matches = find_matching_tariffs(hs, dest_rules)
    for t in tariff_matches:
        if t["rate"] > 0:
            risks.append({
                "type": "additional_tariff",
                "level": "medium" if t["rate"] < 15 else "high",
                "description": f"{t['reason']}，适用税率 +{t['rate']}%",
                "rate": f"{t['rate']}%",
            })

    # ── 2. 关税计算 ──────────────────────────────────────────────
    mfn_rate = dest_rules.get("mfn_rate", 0.0)
    additional_rate = sum(t["rate"] for t in tariff_matches if t["rate"] > 0)
    # 反倾销关税单独加总
    ad_duty_rate = sum(ad["duty_rate"] for ad in ad_matches if ad["duty_rate"] > 0)

    total_tariff_rate = mfn_rate + additional_rate + ad_duty_rate
    mfn_amount = round(value * mfn_rate / 100, 2)
    additional_amount = round(value * additional_rate / 100, 2)
    ad_amount = round(value * ad_duty_rate / 100, 2)
    total_tariff = round(value * total_tariff_rate / 100, 2)

    tariffs = {
        "mfn": {"rate": mfn_rate, "amount": mfn_amount},
        "additional": {"rate": round(additional_rate + ad_duty_rate, 2), "amount": round(additional_amount + ad_amount, 2)},
        "total": total_tariff,
    }

    # ── 3. VAT 计算 ──────────────────────────────────────────────
    vat_rule = dest_rules.get("vat", {})
    vat_rate = vat_rule.get("standard_rate", 0.0)

    # DDP 时：VAT 基数 = CIF + 关税 ≈ 货值 * 1.1 (估算运费+保险) + 关税
    if incoterm == "DDP":
        vat_base = round(value * 1.1 + total_tariff, 2)
    else:
        vat_base = round(value * 1.1, 2)

    vat_amount = round(vat_base * vat_rate / 100, 2)

    vat = {
        "rate": vat_rate,
        "calculation_base": f"{'CIF + 关税' if incoterm == 'DDP' else 'CIF 估算'} (货值×1.1{' + 关税' if incoterm == 'DDP' else ''})",
        "estimated_amount": vat_amount,
    }

    # ── 4. 总税费 ──────────────────────────────────────────────
    total_duty_and_tax = round(total_tariff + (vat_amount if incoterm == "DDP" else 0), 2)

    # ── 5. 认证要求 ──────────────────────────────────────────────
    certs = find_matching_certs(hs, dest_rules)
    required_docs = [
        {
            "name": c["cert_name"],
            "mandatory": c["mandatory"],
            "description": c["description"],
            "authority": c.get("authority", ""),
        }
        for c in certs
    ]

    # ── 6. 特殊单证 ──────────────────────────────────────────────
    special_docs = [
        {
            "name": d["doc_name"],
            "mandatory": d.get("mandatory", True),
            "description": d["description"],
        }
        for d in dest_rules.get("special_docs", [])
    ]

    return {
        "country": dest_rules["country_name"],
        "hsCode": hs,
        "risks": risks,
        "tariffs": tariffs,
        "vat": vat,
        "totalDutyAndTax": total_duty_and_tax,
        "requiredDocs": required_docs,
        "specialDocs": special_docs,
        "notes": dest_rules.get("notes", ""),
    }


# ═══════════════════════════════════════════════════════════════════════
#  单证模板定义（前端可渲染的 fields 数组格式）
# ═══════════════════════════════════════════════════════════════════════

DOC_TEMPLATES = {
    "commercial_invoice": {
        "docType": "commercial_invoice",
        "title": "商业发票 Commercial Invoice",
        "fields": [
            {"name": "exporter", "label": "发货人/出口商", "type": "text", "required": True},
            {"name": "consignee", "label": "收货人", "type": "text", "required": True},
            {"name": "invoiceNo", "label": "发票号", "type": "text", "required": True},
            {"name": "date", "label": "日期", "type": "date", "required": True},
            {"name": "hsCode", "label": "HS编码", "type": "text", "required": True},
            {"name": "goodsDesc", "label": "货物描述", "type": "textarea", "required": True},
            {"name": "quantity", "label": "数量", "type": "number", "required": True},
            {"name": "unitPrice", "label": "单价", "type": "number", "required": True},
            {"name": "totalValue", "label": "总金额", "type": "number", "required": True},
            {"name": "originCountry", "label": "原产国", "type": "text", "required": True},
            {"name": "incoterm", "label": "贸易术语", "type": "text", "required": False},
            {"name": "paymentTerms", "label": "付款条件", "type": "text", "required": False},
        ],
    },
    "packing_list": {
        "docType": "packing_list",
        "title": "装箱单 Packing List",
        "fields": [
            {"name": "exporter", "label": "发货人/出口商", "type": "text", "required": True},
            {"name": "consignee", "label": "收货人", "type": "text", "required": True},
            {"name": "invoiceNo", "label": "关联发票号", "type": "text", "required": True},
            {"name": "packageType", "label": "包装类型", "type": "select", "required": True,
             "options": ["箱 (Carton)", "托盘 (Pallet)", "桶 (Drum)", "木箱 (Crate)", "集装箱 (Container)"]},
            {"name": "totalPackages", "label": "总件数", "type": "number", "required": True},
            {"name": "netWeight", "label": "净重 (kg)", "type": "number", "required": True},
            {"name": "grossWeight", "label": "毛重 (kg)", "type": "number", "required": True},
            {"name": "measurement", "label": "体积 (m³)", "type": "number", "required": True},
            {"name": "marksNumbers", "label": "唛头及编号", "type": "text", "required": False},
            {"name": "goodsDesc", "label": "货物描述", "type": "textarea", "required": False},
        ],
    },
    "certificate_of_origin": {
        "docType": "certificate_of_origin",
        "title": "原产地证书 Certificate of Origin",
        "fields": [
            {"name": "exporter", "label": "出口商", "type": "text", "required": True},
            {"name": "consignee", "label": "收货人", "type": "text", "required": True},
            {"name": "hsCode", "label": "HS编码", "type": "text", "required": True},
            {"name": "originCriterion", "label": "原产地标准", "type": "select", "required": True,
             "options": ["完全获得 (Wholly Obtained)", "税则改变 (Change of Tariff Heading)",
                         "区域价值成分 (RVC ≥ 40%)", "加工工序 (Specific Process)"]},
            {"name": "issuingDate", "label": "签发日期", "type": "date", "required": True},
            {"name": "countryOfOrigin", "label": "原产国", "type": "text", "required": True},
            {"name": "countryOfDestination", "label": "目的国", "type": "text", "required": True},
            {"name": "goodsDesc", "label": "货物描述", "type": "textarea", "required": False},
            {"name": "invoiceNo", "label": "发票号", "type": "text", "required": False},
        ],
    },
    "bill_of_lading": {
        "docType": "bill_of_lading",
        "title": "提单 Bill of Lading",
        "fields": [
            {"name": "shipper", "label": "发货人 (Shipper)", "type": "text", "required": True},
            {"name": "consignee", "label": "收货人 (Consignee)", "type": "text", "required": True},
            {"name": "notifyParty", "label": "通知方 (Notify Party)", "type": "text", "required": False},
            {"name": "vessel", "label": "船名航次 (Vessel & Voyage)", "type": "text", "required": True},
            {"name": "portOfLoading", "label": "装货港 (Port of Loading)", "type": "text", "required": True},
            {"name": "portOfDischarge", "label": "卸货港 (Port of Discharge)", "type": "text", "required": True},
            {"name": "placeOfDelivery", "label": "交货地 (Place of Delivery)", "type": "text", "required": False},
            {"name": "containerNo", "label": "集装箱号", "type": "text", "required": True},
            {"name": "sealNo", "label": "封条号", "type": "text", "required": True},
            {"name": "goodsDesc", "label": "货物描述", "type": "textarea", "required": True},
            {"name": "grossWeight", "label": "毛重 (kg)", "type": "number", "required": True},
            {"name": "measurement", "label": "体积 (m³)", "type": "number", "required": True},
            {"name": "freightCharges", "label": "运费", "type": "text", "required": False},
            {"name": "placeOfIssue", "label": "签发地", "type": "text", "required": False},
            {"name": "dateOfIssue", "label": "签发日期", "type": "date", "required": False},
        ],
    },
}


@app.get("/api/document/template/{doc_type}")
def get_document_template(doc_type: str):
    """返回指定单证类型的字段定义"""
    template = DOC_TEMPLATES.get(doc_type)
    if not template:
        raise HTTPException(
            status_code=404,
            detail=f"不支持的單證類型: {doc_type}，支持: {', '.join(DOC_TEMPLATES.keys())}"
        )
    return template


# ═══════════════════════════════════════════════════════════════════════
#  接口：单证生成  POST /api/document/generate
# ═══════════════════════════════════════════════════════════════════════


@app.post("/api/document/generate")
def generate_document(req: DocGenerateRequest):
    """根据填写字段生成 PDF 文件（reportlab 渲染）"""
    template = DOC_TEMPLATES.get(req.docType)
    if not template:
        raise HTTPException(status_code=404, detail=f"不支持的單證類型: {req.docType}")

    fields = req.fields
    today = date.today().isoformat()
    doc_title = template["title"]

    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import mm
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.enums import TA_CENTER, TA_RIGHT
        from reportlab.platypus import (
            SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
            PageBreak, HRFlowable,
        )
        from reportlab.lib import colors

        buf = io.BytesIO()
        doc = SimpleDocTemplate(
            buf, pagesize=A4,
            leftMargin=20 * mm, rightMargin=20 * mm,
            topMargin=20 * mm, bottomMargin=20 * mm,
        )

        styles = getSampleStyleSheet()

        # ── 自定义样式 ──
        title_style = ParagraphStyle(
            "DocTitle", parent=styles["Title"],
            fontSize=18, leading=22, spaceAfter=6,
            alignment=TA_CENTER, textColor=colors.HexColor("#1E293B"),
        )
        subtitle_style = ParagraphStyle(
            "DocSubtitle", parent=styles["Normal"],
            fontSize=9, leading=11, spaceAfter=16,
            alignment=TA_CENTER, textColor=colors.HexColor("#64748B"),
        )
        cell_label_style = ParagraphStyle(
            "CellLabel", parent=styles["Normal"],
            fontSize=9, leading=12,
            textColor=colors.HexColor("#475569"),
        )
        cell_value_style = ParagraphStyle(
            "CellValue", parent=styles["Normal"],
            fontSize=10, leading=12,
            textColor=colors.HexColor("#0F172A"),
        )
        footer_style = ParagraphStyle(
            "Footer", parent=styles["Normal"],
            fontSize=8, leading=10, spaceBefore=20,
            alignment=TA_CENTER, textColor=colors.HexColor("#94A3B8"),
        )

        elements = []

        # ── 标题 ──
        elements.append(Paragraph(doc_title, title_style))
        elements.append(HRFlowable(width="40%", thickness=1, color=colors.HexColor("#3B82F6")))
        elements.append(Paragraph(f"生成日期: {today}  |  LogiBridge 单证系统", subtitle_style))
        elements.append(Spacer(1, 4 * mm))

        # ── 主表格 ──
        table_data = []
        for i, fdef in enumerate(template["fields"]):
            label = fdef["label"]
            value = fields.get(fdef["name"], "")
            # 交替行背景
            bg = colors.HexColor("#F8FAFC") if i % 2 == 0 else colors.white
            table_data.append([
                Paragraph(f"<b>{label}</b>", cell_label_style),
                Paragraph(str(value) if value else "—", cell_value_style),
            ])

        if table_data:
            col_widths = [doc.width * 0.35, doc.width * 0.65]
            tbl = Table(table_data, colWidths=col_widths, repeatRows=1)
            tbl_style = TableStyle([
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("PADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F1F5F9")),
            ])
            # 应用交替行背景
            for i in range(len(table_data)):
                bg = colors.HexColor("#F8FAFC") if i % 2 == 0 else colors.white
                tbl_style.add("BACKGROUND", (1, i), (1, i), bg)
            tbl.setStyle(tbl_style)
            elements.append(tbl)

        # ── 底部声明 ──
        elements.append(Spacer(1, 12 * mm))
        elements.append(Paragraph(
            "This document was generated by LogiBridge Document System and is for reference only. "
            "The official version shall prevail.",
            footer_style,
        ))

        doc.build(elements)
        pdf_bytes = buf.getvalue()
        buf.close()

        filename = f"{req.docType}_{today}.pdf"
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    except ImportError:
        # reportlab 未安装 — 降级返回 HTML
        html = (
            f"<html><head><meta charset='utf-8'>"
            f"<style>body{{font-family:sans-serif;padding:40px;background:#f8fafc}}"
            f"h2{{color:#1e293b;border-bottom:2px solid #3b82f6;padding-bottom:8px}}"
            f"table{{width:100%;border-collapse:collapse;margin-top:16px}}"
            f"td{{padding:10px 12px;border:1px solid #e2e8f0}}"
            f"td.label{{background:#f1f5f9;font-weight:600;width:30%}}"
            f".footer{{text-align:center;color:#94a3b8;font-size:12px;margin-top:24px}}</style>"
            f"</head><body>"
            f"<h2>{doc_title}</h2>"
            f"<table>"
        )
        for fdef in template["fields"]:
            label = fdef["label"]
            value = fields.get(fdef["name"], "")
            html += f"<tr><td class='label'>{label}</td><td>{value or '—'}</td></tr>"
        html += (
            f"</table>"
            f"<p class='footer'>生成日期: {today} | LogiBridge 单证系统 · 仅供参考</p>"
            f"</body></html>"
        )
        return Response(content=html, media_type="text/html")


# ═══════════════════════════════════════════════════════════════════════
#  货物追踪 API
# ═══════════════════════════════════════════════════════════════════════


@app.get("/api/shipments")
def list_shipments(
    status: str = Query("", description="按状态过滤"),
    search: str = Query("", description="提单号搜索"),
):
    """返回货物列表，支持状态过滤和提单号搜索"""
    shipments = get_mock_shipments_list()
    result = []

    for s in shipments:
        if status and s["status"] != status:
            continue
        if search and search.lower() not in s["bl_number"].lower():
            continue
        result.append(s)

    return result


@app.get("/api/shipments/{bl_number}/events")
def get_shipment_events(bl_number: str):
    """返回货物的轨迹时间线"""
    data = get_mock_shipment(bl_number)
    if not data:
        raise HTTPException(status_code=404, detail=f"提单号 {bl_number} 未找到")

    events = []
    for ev in data["events"]:
        events.append({
            "id": "",
            "shipmentId": bl_number,
            "eventType": ev["event_type"],
            "location": ev["location"],
            "timestamp": ev["timestamp"],
            "description": ev["description"],
        })

    return {"blNumber": bl_number, "events": events}


@app.get("/api/shipments/{bl_number}/risk")
def get_shipment_risk(bl_number: str):
    """检查货物是否受当前活跃风险事件影响"""
    data = get_mock_shipment(bl_number)
    if not data:
        raise HTTPException(status_code=404, detail=f"提单号 {bl_number} 未找到")

    # 加载风险事件进行匹配
    risk_path = OUTPUT_DIR / "risk_events.json"
    active_risks = []
    if risk_path.exists():
        with open(risk_path, "r", encoding="utf-8") as f:
            events = json.load(f)

        today = datetime.now(timezone.utc).isoformat()
        for ev in events:
            if ev["end_date"] < today[:10]:
                continue
            # 检查是否影响该货物的起运港或目的港
            if data["origin"] in ev["affected_ports"] or data["destination"] in ev["affected_ports"]:
                active_risks.append({
                    "type": ev["type"],
                    "severity": ev["severity"],
                    "title": ev["title"],
                    "description": ev["description"][:200],
                    "radius_km": ev["radius_km"],
                })

    overall = "low"
    for r in active_risks:
        if r["severity"] == "critical":
            overall = "critical"
            break
        if r["severity"] == "high" and overall != "critical":
            overall = "high"
        if r["severity"] == "medium" and overall not in ("critical", "high"):
            overall = "medium"

    return {
        "blNumber": bl_number,
        "riskLevel": overall,
        "risks": [r["title"] for r in active_risks],
        "activeRiskEvents": active_risks,
    }


@app.get("/api/risk/events")
def get_risk_events():
    """返回当前活跃的风险事件列表，GeoJSON FeatureCollection 格式"""
    risk_path = OUTPUT_DIR / "risk_events.json"
    if not risk_path.exists():
        return {"type": "FeatureCollection", "features": []}

    with open(risk_path, "r", encoding="utf-8") as f:
        events = json.load(f)

    today = datetime.now(timezone.utc).isoformat()[:10]
    features = []
    for ev in events:
        if ev["end_date"] < today:
            continue
        features.append({
            "type": "Feature",
            "properties": {
                "id": ev["id"],
                "type": ev["type"],
                "severity": ev["severity"],
                "title": ev["title"],
                "description": ev["description"][:150],
                "radius_km": ev["radius_km"],
                "start_date": ev["start_date"],
                "end_date": ev["end_date"],
                "source": ev["source"],
            },
            "geometry": ev["geometry"],
        })

    return {"type": "FeatureCollection", "features": features}


@app.post("/api/shipments/{bl_number}/alert")
def set_shipment_alert(bl_number: str, delay_days: int = Query(3, description="延迟超过几天通知")):
    """为货物设置预警规则"""
    data = get_mock_shipment(bl_number)
    if not data:
        raise HTTPException(status_code=404, detail=f"提单号 {bl_number} 未找到")

    return {
        "blNumber": bl_number,
        "alertSet": True,
        "delayThresholdDays": delay_days,
        "message": f"当 {bl_number} 延误超过 {delay_days} 天时将发送通知",
    }


# ═══════════════════════════════════════════════════════════════════════
#  咨询 / 知识库 API  — MVP 内存存储
# ═══════════════════════════════════════════════════════════════════════

# ── Pydantic 模型 ─────────────────────────────────────────────────


class CreateConsultationRequest(BaseModel):
    subject: str = Field(..., description="咨询主题")
    category: str = Field(..., description="咨询分类，如 'compliance' / 'freight' / 'customs'")
    initialMessage: Optional[str] = Field(None, description="可选初始消息")


class SendMessageRequest(BaseModel):
    content: str = Field(..., description="消息内容")
    attachments: Optional[list[dict]] = Field(None, description="附件列表")
    metadata: Optional[dict] = Field(None, description="附加元数据")


class Consultation(BaseModel):
    id: str
    userId: str
    subject: str
    category: str
    status: str  # active | closed
    createdAt: str
    updatedAt: str
    messages: list["Message"] = []


class Message(BaseModel):
    id: str
    consultationId: str
    senderType: str  # user | ai | system
    content: str
    attachments: list[dict] = []
    metadata: dict = {}
    createdAt: str


# ── 内存存储 ────────────────────────────────────────────────────

CONSULTATIONS: dict[str, dict] = {}  # id -> consultation dict
MESSAGES: dict[str, list[dict]] = {}  # consultationId -> list of message dicts

# ── 固定用户（MVP 阶段） ──────────────────────────────────────────

DEFAULT_USER_ID = "user-mvp-001"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id() -> str:
    return uuid.uuid4().hex[:12]


# ── AI 自动回复 — 基于真实数据的关键词匹配引擎 ──────────────

# HS 编码正则：4-10 位纯数字（不使用 \b 以避免中日文分隔符问题）
HS_CODE_RE = re.compile(r'(?<!\d)(\d{4,10})(?!\d)')
# 提单号正则：BL + 6 位以上数字
BL_NUMBER_RE = re.compile(r'(?<![A-Za-z0-9])(BL\d{6,})(?![A-Za-z0-9])', re.IGNORECASE)
# 港口代码正则：5 位字母代码（如 CNSHA、USLAX）
PORT_CODE_RE = re.compile(r'(?<![A-Za-z])([A-Za-z]{5})(?![A-Za-z])')


def _find_hs_codes(text: str) -> list[str]:
    """从消息文本中提取 HS 编码（排除 BL 编号等数字序列）"""
    # 先移除已知的数字模式（提单号、集装箱号等）
    cleaned = BL_NUMBER_RE.sub("", text)
    return list(set(HS_CODE_RE.findall(cleaned)))


def _find_bl_numbers(text: str) -> list[str]:
    """从消息文本中提取提单号"""
    return list(set(BL_NUMBER_RE.findall(text)))


def _find_ports(text: str) -> list[dict]:
    """从消息文本中搜索匹配的港口（优先代码匹配，其次名称关键词匹配）"""
    # 优先：查找 5 位港口代码（如 CNSHA, USLAX）— O(1) 字典查找
    matched: list[dict] = []
    code_matches = PORT_CODE_RE.findall(text.upper())
    for code in code_matches:
        port = PORTS_BY_CODE.get(code)
        if port and port not in matched:
            matched.append(port)

    # 其次：用关键词搜索港口名称 — 仅当代码未匹配时
    if not matched:
        keywords = [w for w in re.split(r'[\s,;:，；：、]', text.strip()) if 2 <= len(w) <= 20]
        seen_codes = set()
        for kw in keywords:
            kw_lower = kw.lower()
            for port in PORTS:
                code = port.get("code", "")
                if code in seen_codes:
                    continue
                name = port.get("name", "").lower()
                if kw_lower in name or name in kw_lower:
                    matched.append(port)
                    seen_codes.add(code)
                    if len(matched) >= 5:
                        break
            if len(matched) >= 5:
                break

    return matched[:5]


def _build_hs_response(hs_codes: list[str], category: str) -> str | None:
    """如果匹配到 HS 编码，自动查询 compliance_rules.json 生成合规回复"""
    rules_data = COMPLIANCE.get("rules", {})
    lines: list[str] = []
    first = True

    for hs in hs_codes:
        # 查找前 4 位（或前 2 位）用于模式匹配
        hs_prefix_4 = hs[:4] if len(hs) >= 4 else hs
        hs_prefix_2 = hs[:2] if len(hs) >= 2 else hs

        for country_code, country_rules in rules_data.items():
            country_name = country_rules.get("country_name", country_code)

            # 查找匹配的额外关税
            matched_tariffs = []
            for t in country_rules.get("additional_tariffs", []):
                if hs_matches_pattern(hs, t["hs_pattern"]):
                    matched_tariffs.append(t)

            # 查找匹配的反倾销
            matched_ad = []
            for ad in country_rules.get("anti_dumping", []):
                if hs_matches_pattern(hs, ad["hs_range"]):
                    matched_ad.append(ad)

            # 查找匹配的认证要求
            matched_certs = []
            if hs.startswith(hs_prefix_4) or hs.startswith(hs_prefix_2):
                for c in country_rules.get("required_certs", []):
                    if hs_matches_pattern(hs, c.get("applies_to_hs_pattern", ".*")):
                        matched_certs.append(c)

            # 只要有任何匹配，就输出该国家的分析
            if matched_tariffs or matched_ad or matched_certs:
                if first:
                    lines.append(f"**您提到的 HS 编码 {hs} 涉及以下合规要求：**")
                    first = False
                else:
                    lines.append(f"")
                lines.append(f"")
                lines.append(f"📌 **{country_name}**")
                if matched_tariffs:
                    for t in matched_tariffs:
                        rate = t.get("rate", 0)
                        if rate > 0:
                            lines.append(f"  • 附加关税：+{rate}% — {t['reason']}")
                if matched_ad:
                    for ad in matched_ad:
                        rate_str = f"{ad['duty_rate']}%" if ad.get("duty_rate", 0) > 0 else "调查中"
                        lines.append(f"  • 反倾销税：{rate_str} — {ad.get('product', '')}")
                if matched_certs:
                    lines.append(f"  • 认证要求：")
                    for c in matched_certs[:3]:
                        lines.append(f"    - {c['cert_name']}（{'强制' if c.get('mandatory') else '建议'}）")

    if lines:
        lines.append(f"")
        lines.append(f"💡 *建议使用「合规扫描」工具获取精确关税计算。*")
        return "\n".join(lines)

    return None


def _build_port_response(ports_found: list[dict]) -> str | None:
    """如果匹配到港口名，推荐相关方案或风险信息"""
    if not ports_found:
        return None

    lines = [f"**我注意到了以下港口信息：**\n"]
    for port in ports_found[:3]:
        code = port.get("code", "")
        name = port.get("name", "")
        country = port.get("country", "")
        lines.append(f"  • **{code}** — {name}（{country}）")

    # 查询是否有该港口相关的风险事件
    risk_path = OUTPUT_DIR / "risk_events.json"
    if risk_path.exists():
        try:
            with open(risk_path, "r", encoding="utf-8") as f:
                events = json.load(f)
            today = datetime.now(timezone.utc).isoformat()[:10]
            port_codes = [p.get("code", "") for p in ports_found]
            affected = []
            for ev in events:
                if ev.get("end_date", "") >= today:
                    for pc in port_codes:
                        if pc in ev.get("affected_ports", []):
                            affected.append(ev)
                            break
            if affected:
                lines.append(f"\n⚠️ **风险提醒：** 以下活跃风险事件可能影响相关港口：")
                for ev in affected[:2]:
                    lines.append(f"  • {ev['title']}（{ev['severity']}）— {ev.get('description', '')[:80]}...")
        except Exception:
            pass

    lines.append(f"\n*如需查询具体航线运费或合规要求，请进一步说明。*")
    return "\n".join(lines)


def _build_shipment_response(bl_numbers: list[str]) -> str | None:
    """如果匹配到提单号，返回货物追踪信息"""
    found = []
    for bl in bl_numbers:
        data = get_mock_shipment(bl.upper())
        if data:
            found.append(data)

    if not found:
        return None

    lines = [f"**我查询到以下货物信息：**\n"]
    for s in found:
        bl = s.get("bl_number", "")
        cargo = s.get("cargo_desc", "")
        origin = s.get("origin", "")
        dest = s.get("destination", "")
        status = s.get("status", "")
        vessel = s.get("vessel_name", "")
        eta = s.get("eta", "")[:10]

        status_map = {
            "in_transit": "🚢 运输中",
            "delayed": "⚠️ 延误",
            "customs_clearance": "📋 清关中",
            "delivered": "✅ 已交付",
        }
        status_label = status_map.get(status, status)

        lines.append(f"  • **提单号：** {bl}")
        lines.append(f"    货物：{cargo}")
        lines.append(f"    航线：{origin} → {dest}")
        lines.append(f"    状态：{status_label}")
        lines.append(f"    船名：{vessel}")
        lines.append(f"    预计到港：{eta}")
        lines.append(f"")

    # 如果有延误货物，给出建议
    delayed = [s for s in found if s.get("status") == "delayed"]
    if delayed:
        lines.append(f"⚠️ 以上货物有延误情况，建议您：")
        lines.append(f"  1. 与收货人及时沟通预计到港时间变化")
        lines.append(f"  2. 检查是否需要调整清关/仓存安排")
        lines.append(f"  3. 如需详细轨迹，请使用货物追踪功能")

    return "\n".join(lines)


def _build_default_response(category: str) -> str:
    """根据分类生成默认回复"""
    if category == "compliance":
        return (
            "感谢您的咨询！我已收到您的消息。\n\n"
            "如果您有具体的 HS 编码、目的国或货物信息，请提供给我，我可以帮您：\n"
            "  • 查询该商品的合规要求与关税税率\n"
            "  • 检查反倾销/附加税风险\n"
            "  • 推荐必要的认证与单证\n\n"
            "例如：*\"HS编码 610910 出口到美国需要什么认证？\"*"
        )
    elif category == "freight":
        return (
            "感谢您的咨询！如需了解运费相关信息，请告诉我：\n\n"
            "  • 起运港和目的港（例如：上海到洛杉矶）\n"
            "  • 集装箱类型（20GP / 40GP / 40HQ）\n\n"
            "我可以为您估算运费、分析航线风险。"
        )
    elif category == "customs":
        return (
            "感谢您的咨询！关于报关问题，我可以帮您：\n\n"
            "  • 生成报关所需单证（商业发票、装箱单、提单等）\n"
            "  • 查询目的地海关特殊要求\n"
            "  • 了解 HS 编码归类\n\n"
            "请提供更多信息，例如 HS 编码、起运港/目的港。"
        )
    else:
        return (
            "感谢您的咨询！我已收到您的消息。\n\n"
            "请提供更多具体信息，例如：\n"
            "  • HS 编码（如 610910）\n"
            "  • 起运港和目的港代码（如 CNSHA → USLAX）\n"
            "  • 提单号（如 BL202606001）\n\n"
            "这将帮助我给出更精准的分析和建议。"
        )


def ai_respond_to_message(consultation_id: str, message_text: str) -> str:
    """
    根据用户消息内容生成 AI 回复：
    1. 提取 HS 编码 → 查询合规规则
    2. 提取港口名 → 推荐方案/风险
    3. 提取提单号 → 返回货物信息
    4. 无匹配 → 分类默认回复
    """
    hs_codes = _find_hs_codes(message_text)
    ports_found = _find_ports(message_text)
    bl_numbers = _find_bl_numbers(message_text)

    # 优先：HS 编码 → 合规数据
    category = CONSULTATIONS.get(consultation_id, {}).get("category", "general")
    hs_response = _build_hs_response(hs_codes, category) if hs_codes else None
    if hs_response:
        return hs_response

    # 其次：提单号 → 货物追踪
    bl_response = _build_shipment_response(bl_numbers) if bl_numbers else None
    if bl_response:
        return bl_response

    # 其次：港口 → 风险信息
    port_response = _build_port_response(ports_found) if ports_found else None
    if port_response:
        return port_response

    # 兜底：分类默认回复
    return _build_default_response(category)


def _create_ai_message(consultation_id: str, content: str) -> dict:
    """创建 AI 消息并存入存储"""
    msg = {
        "id": _new_id(),
        "consultationId": consultation_id,
        "senderType": "ai",
        "content": content,
        "attachments": [],
        "metadata": {},
        "createdAt": _now_iso(),
    }
    if consultation_id not in MESSAGES:
        MESSAGES[consultation_id] = []
    MESSAGES[consultation_id].append(msg)
    # 同步到 consultation 对象
    if consultation_id in CONSULTATIONS:
        CONSULTATIONS[consultation_id]["updatedAt"] = _now_iso()
    return msg


def _build_consultation_dict(c_id: str) -> dict:
    """组装完整的 Consultation 对象（含 messages）"""
    c = CONSULTATIONS.get(c_id)
    if not c:
        return None
    return {
        **c,
        "messages": MESSAGES.get(c_id, []),
    }


# ── 1. POST /api/consultations ────────────────────────────────


@app.post("/api/consultations", status_code=201)
def create_consultation(req: CreateConsultationRequest):
    c_id = _new_id()
    now = _now_iso()

    consultation = {
        "id": c_id,
        "userId": DEFAULT_USER_ID,
        "subject": req.subject,
        "category": req.category,
        "status": "active",
        "createdAt": now,
        "updatedAt": now,
    }
    CONSULTATIONS[c_id] = consultation
    MESSAGES[c_id] = []

    # 如果有初始消息，创建第一条消息
    if req.initialMessage:
        msg = {
            "id": _new_id(),
            "consultationId": c_id,
            "senderType": "user",
            "content": req.initialMessage,
            "attachments": [],
            "metadata": {},
            "createdAt": now,
        }
        MESSAGES[c_id].append(msg)
        # AI 自动回复 — 基于消息内容的关键词匹配
        ai_content = ai_respond_to_message(c_id, req.initialMessage)
        _create_ai_message(c_id, ai_content)

    return _build_consultation_dict(c_id)


# ── 2. GET /api/consultations ────────────────────────────────


@app.get("/api/consultations")
def list_consultations():
    """返回当前用户的所有咨询会话，按更新时间倒序"""
    result = [
        _build_consultation_dict(c_id)
        for c_id, c in CONSULTATIONS.items()
        if c["userId"] == DEFAULT_USER_ID
    ]
    result.sort(key=lambda x: x["updatedAt"], reverse=True)
    return result


# ── 3. GET /api/consultations/{id} ───────────────────────────


@app.get("/api/consultations/{consultation_id}")
def get_consultation(consultation_id: str):
    c = _build_consultation_dict(consultation_id)
    if not c:
        raise HTTPException(status_code=404, detail="咨询会话未找到")
    return c


# ── 4. POST /api/consultations/{id}/messages ─────────────────


@app.post("/api/consultations/{consultation_id}/messages", status_code=201)
def send_message(consultation_id: str, req: SendMessageRequest):
    if consultation_id not in CONSULTATIONS:
        raise HTTPException(status_code=404, detail="咨询会话未找到")
    if CONSULTATIONS[consultation_id]["status"] == "closed":
        raise HTTPException(status_code=400, detail="咨询会话已关闭，无法发送消息")

    now = _now_iso()
    msg = {
        "id": _new_id(),
        "consultationId": consultation_id,
        "senderType": "user",
        "content": req.content,
        "attachments": req.attachments or [],
        "metadata": req.metadata or {},
        "createdAt": now,
    }
    MESSAGES[consultation_id].append(msg)
    CONSULTATIONS[consultation_id]["updatedAt"] = now

    # 自动触发 AI 回复 — 基于真实数据的关键词匹配
    ai_content = ai_respond_to_message(consultation_id, req.content)
    _create_ai_message(consultation_id, ai_content)

    return msg


# ── 5. GET /api/consultations/{id}/context ─────────────────


@app.get("/api/consultations/{consultation_id}/context")
def get_consultation_context(consultation_id: str):
    """返回 AI 上下文快照：关联的货物、方案、合规扫描结果"""
    c = CONSULTATIONS.get(consultation_id)
    if not c:
        raise HTTPException(status_code=404, detail="咨询会话未找到")

    metadata = c.get("metadata", {})
    context = {
        "consultationId": consultation_id,
        "subject": c["subject"],
        "category": c["category"],
        "referencedShipments": [],
        "referencedSolutions": [],
        "complianceSnapshots": [],
    }

    # 查询关联的货物
    shipment_ids = metadata.get("shipmentIds", [])
    if not shipment_ids:
        # 尝试从消息 metadata 中提取
        msgs = MESSAGES.get(consultation_id, [])
        for msg in msgs:
            refs = msg.get("metadata", {}).get("shipmentIds", [])
            shipment_ids.extend(refs)
        shipment_ids = list(set(shipment_ids))

    for bl in shipment_ids:
        shipment_data = get_mock_shipment(bl)
        if shipment_data:
            context["referencedShipments"].append({
                "blNumber": bl,
                "cargoDesc": shipment_data.get("cargo_desc", ""),
                "origin": shipment_data.get("origin", ""),
                "destination": shipment_data.get("destination", ""),
                "status": shipment_data.get("status", ""),
            })

    return context


# ── 6. GET /api/knowledge/search ────────────────────────────


# MVP 内置知识库
KNOWLEDGE_ARTICLES: list[dict] = [
    {"id": "k001", "title": "如何正确归类 HS 编码", "content": "HS编码是世界海关组织制定的商品分类体系。前6位为国际统一编码，后续位由各国自行规定。正确归类是合规报关的基础。", "tags": ["HS编码", "归类", "报关"]},
    {"id": "k002", "title": "常见贸易术语 Incoterms 2020 解读", "content": "Incoterms 2020 包含11种贸易术语，明确了买卖双方的责任、风险、费用划分。常用的有 EXW、FOB、CIF、DAP、DDP 等。", "tags": ["Incoterms", "贸易术语", "FOB", "CIF"]},
    {"id": "k003", "title": "美国海关清关流程", "content": "美国海关（CBP）要求进口商提交 ISF（10+2）申报，到港前24小时提交。后续包括报关、查验、放行等环节。ACE系统是主要电子申报平台。", "tags": ["美国", "清关", "CBP", "ISF"]},
    {"id": "k004", "title": "欧盟海关合规要求", "content": "欧盟进口需进行 EORI 注册。自2021年起实施 ICS2 安全申报制度。不同成员国可能执行不同的 VAT 税率和附加要求。", "tags": ["欧盟", "海关", "EORI", "ICS2"]},
    {"id": "k005", "title": "反倾销税与关税计算方法", "content": "反倾销税是针对以低于正常价值出口的商品征收的额外关税。计算方式包括从价税、从量税和混合税。需关注各国贸易救济调查动态。", "tags": ["反倾销", "关税", "贸易救济"]},
    {"id": "k006", "title": "海运运费构成与附加费说明", "content": "海运运费由基础运费和各种附加费组成。常见附加费：BAF（燃油附加费）、LSS（低硫附加费）、PSS（旺季附加费）、ORC（码头操作费）等。", "tags": ["运费", "海运", "BAF", "附加费"]},
    {"id": "k007", "title": "锂电池运输合规指南", "content": "锂电池属于第9类危险品。UN3480/UN3481。运输需符合 IMDG Code 要求，提供 MSDS、危险品申报单等文件。", "tags": ["锂电池", "危险品", "IMDG", "MSDS"]},
    {"id": "k008", "title": "纺织品出口常见监管要求", "content": "纺织品出口需关注：原产地规则、配额限制（部分国家）、标签要求、REACH 法规（欧盟）、CPSIA 要求（美国）等。", "tags": ["纺织品", "出口", "REACH", "CPSIA"]},
    {"id": "k009", "title": "海关查验常见原因与应对", "content": "海关查验常见原因：HS编码归类错误、申报价值异常、品名不符、许可证缺失。应对：提前准备完整单证、如实申报、咨询专业报关行。", "tags": ["查验", "海关", "申报"]},
    {"id": "k010", "title": "自由贸易协定（FTA）关税优惠攻略", "content": "利用FTA关税优惠可显著降低进口成本。常见协定的有 RCEP、USMCA、欧盟GSP等。需准备原产地证书或原产地声明。", "tags": ["FTA", "关税优惠", "RCEP", "原产地证"]},
    {"id": "k011", "title": "货物追踪与风险管理", "content": "LogiBridge 提供实时货物追踪功能，结合 AIS 船舶定位、天气预警、地缘政治风险事件。可及时预警延误、绕航、港口拥堵等。", "tags": ["追踪", "风险管理", "AIS"]},
]


@app.get("/api/knowledge/search")
def search_knowledge(
    q: str = Query("", min_length=0),
    limit: int = Query(10, ge=1, le=50),
):
    """搜索知识库文章，匹配标题、内容、标签"""
    if not q.strip():
        return KNOWLEDGE_ARTICLES[:limit]

    q_lower = q.strip().lower()

    def score(article: dict) -> int:
        s = 0
        if q_lower in article["title"].lower():
            s += 100
        if any(q_lower in tag.lower() for tag in article["tags"]):
            s += 50
        if q_lower in article["content"].lower():
            s += 10
        # 完整短语匹配额外加分
        if q_lower in article["title"].lower().split():
            s += 20
        return s

    scored = [(score(a), a) for a in KNOWLEDGE_ARTICLES]
    scored.sort(key=lambda x: x[0], reverse=True)
    results = [a for s, a in scored if s > 0]
    return results[:limit]


# ── 7. POST /api/consultations/{id}/close ──────────────────


@app.post("/api/consultations/{consultation_id}/close")
def close_consultation(consultation_id: str):
    if consultation_id not in CONSULTATIONS:
        raise HTTPException(status_code=404, detail="咨询会话未找到")
    if CONSULTATIONS[consultation_id]["status"] == "closed":
        raise HTTPException(status_code=400, detail="咨询会话已关闭")

    CONSULTATIONS[consultation_id]["status"] = "closed"
    CONSULTATIONS[consultation_id]["updatedAt"] = _now_iso()

    # 系统提示消息
    sys_msg = {
        "id": _new_id(),
        "consultationId": consultation_id,
        "senderType": "system",
        "content": "咨询会话已关闭。如需进一步协助，欢迎重新咨询。",
        "attachments": [],
        "metadata": {},
        "createdAt": _now_iso(),
    }
    MESSAGES[consultation_id].append(sys_msg)

    return _build_consultation_dict(consultation_id)


# ═══════════════════════════════════════════════════════════════════════
#  认证 API
# ═══════════════════════════════════════════════════════════════════════


@app.post("/api/auth/register", status_code=201)
def register(req: UserCreate):
    """注册：存入数据库，返回 JWT"""
    # 密码长度校验
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="密码长度不能少于 6 位")

    # 检查邮箱唯一性
    from auth import get_user_by_email
    existing = get_user_by_email(req.email)
    if existing:
        raise HTTPException(status_code=409, detail="该邮箱已被注册")

    # 创建用户并存入数据库
    user = create_user(email=req.email, password=req.password, name=req.name)
    token = create_access_token(data={
        "sub": user["id"],
        "email": user["email"],
        "name": user["name"],
        "createdAt": user["createdAt"],
    })

    return TokenResponse(
        access_token=token,
        user=user_to_public(user),
    )


@app.post("/api/auth/login")
def login(req: UserLogin):
    """登录：查库验证邮箱密码，返回 JWT"""
    from auth import authenticate_user
    user = authenticate_user(email=req.email, password=req.password)
    if not user:
        raise HTTPException(
            status_code=401,
            detail="邮箱或密码错误",
        )

    token = create_access_token(data={
        "sub": user["id"],
        "email": user["email"],
        "name": user["name"],
        "createdAt": user["createdAt"],
    })
    return TokenResponse(
        access_token=token,
        user=user_to_public(user),
    )


@app.get("/api/auth/me")
def get_me(current_user: dict = Depends(get_current_user)):
    """返回当前用户信息（需登录）"""
    if not current_user:
        raise HTTPException(status_code=401, detail="需要登录")
    return user_to_public(current_user)


# ═══════════════════════════════════════════════════════════════════════
#  用户设置 API
# ═══════════════════════════════════════════════════════════════════════


@app.get("/api/user/settings")
def get_user_settings_route(
    current_user: dict = Depends(get_current_user_required),
):
    """返回当前用户的设置"""
    return get_user_settings(current_user["id"])


@app.put("/api/user/settings")
def update_user_settings_route(
    req: UserSettingsUpdate,
    current_user: dict = Depends(get_current_user_required),
):
    """更新用户设置（语言、货币、默认贸易术语、通知偏好）"""
    updated = update_user_settings(
        current_user["id"],
        req.model_dump(exclude_none=True),
    )
    return updated


# ═══════════════════════════════════════════════════════════════════════
#  API Key 管理
# ═══════════════════════════════════════════════════════════════════════


@app.post("/api/user/api-keys", status_code=201)
def create_api_key(
    name: str = Query("", description="API Key 名称"),
    current_user: dict = Depends(get_current_user_required),
):
    """生成新 API key"""
    return create_api_key_for_user(current_user["id"], name=name)


@app.get("/api/user/api-keys")
def list_api_keys(
    current_user: dict = Depends(get_current_user_required),
):
    """列出所有 API keys"""
    return list_api_keys_for_user(current_user["id"])


@app.delete("/api/user/api-keys/{key_id}")
def delete_api_key(
    key_id: str,
    current_user: dict = Depends(get_current_user_required),
):
    """删除指定 API key"""
    deleted = delete_api_key_for_user(current_user["id"], key_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="API Key 未找到")
    return {"detail": "已删除"}


# ── 根路由 ─────────────────────────────────────────────────────────


@app.get("/")
def root():
    return {
        "service": "LogiBridge API",
        "version": "1.0.0",
        "endpoints": {
            "GET  /api/port/search?q=":                                          "港口模糊搜索",
            "GET  /api/hscode/search?q=":                                        "HS 编码模糊搜索",
            "POST /api/freight/estimate":                                        "运费估算",
            "POST /api/compliance/scan":                                         "合规扫描",
            "GET  /api/document/template/{doc_type}":                            "单证模板（JSON Schema）",
            "POST /api/document/generate":                                       "单证生成（PDF）",
            "GET  /api/shipments":                                               "货物列表",
            "GET  /api/shipments/{bl}/events":                                   "轨迹时间线",
            "GET  /api/shipments/{bl}/risk":                                     "货物风险检查",
            "GET  /api/risk/events":                                             "风险事件地图(GeoJSON)",
            "POST /api/shipments/{bl}/alert":                                    "设置预警",
            # ── 咨询 / 知识库 ──
            "POST /api/consultations":                                           "创建咨询会话",
            "GET  /api/consultations":                                           "咨询列表（按更新时间倒序）",
            "GET  /api/consultations/{id}":                                      "咨询详情（含消息列表）",
            "POST /api/consultations/{id}/messages":                             "发送消息（自动触发AI回复）",
            "GET  /api/consultations/{id}/context":                              "AI上下文快照（关联货物/方案/合规）",
            "GET  /api/knowledge/search?q=":                                     "知识库搜索（标题/内容/标签）",
            "POST /api/consultations/{id}/close":                                "关闭咨询会话",
        },
    }
