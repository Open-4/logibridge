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
from typing import Optional
from datetime import date, datetime

from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field

# ── 确保能导入同级模块 ──────────────────────────────────────────────
sys.path.insert(0, str(Path(__file__).resolve().parent))
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
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── 内存数据 ────────────────────────────────────────────────────────
PORTS: list[dict] = []
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
        print(f"[启动] 加载港口数据: {len(PORTS)} 条")
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

        today = datetime.utcnow().isoformat()
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

    today = datetime.utcnow().isoformat()[:10]
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


# ── 根路由 ─────────────────────────────────────────────────────────


@app.get("/")
def root():
    return {
        "service": "LogiBridge API",
        "version": "1.0.0",
        "endpoints": {
            "GET  /api/port/search?q=":               "港口模糊搜索",
            "GET  /api/hscode/search?q=":              "HS 编码模糊搜索",
            "POST /api/freight/estimate":              "运费估算",
            "POST /api/compliance/scan":               "合规扫描",
            "GET  /api/document/template/{doc_type}":  "单证模板（JSON Schema）",
            "POST /api/document/generate":             "单证生成（PDF）",
            "GET  /api/shipments":                     "货物列表",
            "GET  /api/shipments/{bl}/events":         "轨迹时间线",
            "GET  /api/shipments/{bl}/risk":           "货物风险检查",
            "GET  /api/risk/events":                   "风险事件地图(GeoJSON)",
            "POST /api/shipments/{bl}/alert":          "设置预警",
        },
    }
