"""
api_server.py — FastAPI 应用：港口查询、HS 编码查询、运费估算
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ── 确保能导入同级模块 ──────────────────────────────────────────────
sys.path.insert(0, str(Path(__file__).resolve().parent))
from freight_estimator import estimate_freight

# ── 数据目录 ────────────────────────────────────────────────────────
OUTPUT_DIR = Path(__file__).resolve().parent / "output"

# ── 应用实例 ────────────────────────────────────────────────────────
app = FastAPI(
    title="LogiBridge 运费估算 API",
    description=(
        "港口搜索 · HS 编码搜索 · 海运运费估算"
    ),
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


# ── 启动事件 ────────────────────────────────────────────────────────


@app.on_event("startup")
def load_data():
    global PORTS, HS_CODES

    ports_path = OUTPUT_DIR / "ports.json"
    hscodes_path = OUTPUT_DIR / "hs_codes.json"

    if ports_path.exists():
        with open(ports_path, "r", encoding="utf-8") as f:
            PORTS = json.load(f)
        print(f"[启动] 加载港口数据: {len(PORTS)} 条")
    else:
        print(f"[启动] 警告: {ports_path} 不存在，港口搜索不可用")

    if hscodes_path.exists():
        with open(hscodes_path, "r", encoding="utf-8") as f:
            HS_CODES = json.load(f)
        print(f"[启动] 加载 HS 编码数据: {len(HS_CODES)} 条")
    else:
        print(f"[启动] 警告: {hscodes_path} 不存在，HS 编码搜索不可用")


# ── 接口：港口搜索 ────────────────────────────────────────────────


@app.get("/api/port/search")
def search_port(
    q: str = Query("", min_length=0, description="搜索关键词"),
    limit: int = Query(15, ge=1, le=100),
):
    """
    模糊匹配港口 code 或 name，返回前 limit 条。
    """
    if not q.strip():
        return PORTS[:limit]

    q_lower = q.strip().lower()

    def match(port: dict) -> bool:
        return q_lower in port.get("code", "").lower() or q_lower in port.get("name", "").lower()

    def sort_key(port: dict) -> tuple:
        """
        排序 key（升序）：
        1. code 前缀匹配（False=0 排前面）
        2. name 前缀匹配
        3. code 子串匹配
        4. name 子串匹配
        5. name 字母升序
        """
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
    q: str = Query("", min_length=0, description="搜索关键词"),
    limit: int = Query(15, ge=1, le=100),
):
    """
    模糊匹配 HS 编码 code 或 description，返回前 limit 条。
    """
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
    """
    根据起运港、目的港和集装箱类型估算海运运费。
    """
    try:
        return estimate_freight(req.origin, req.destination, req.containerType)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"内部错误: {e}")


# ── 根路由 ─────────────────────────────────────────────────────────


@app.get("/")
def root():
    return {
        "service": "LogiBridge 运费估算 API",
        "version": "1.0.0",
        "endpoints": {
            "GET  /api/port/search?q=":      "港口模糊搜索",
            "GET  /api/hscode/search?q=":     "HS 编码模糊搜索",
            "POST /api/freight/estimate":     "运费估算",
        },
    }
