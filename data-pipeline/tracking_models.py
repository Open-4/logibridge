"""
货物追踪数据模型 — Pydantic 模型 + 模拟数据

对应 TypeScript 接口定义和 PostgreSQL 建表 SQL。
"""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


# ── 枚举 ──────────────────────────────────────────────────────────────

class ShipmentStatusEnum(str, Enum):
    IN_TRANSIT = "in_transit"
    CUSTOMS_CLEARANCE = "customs_clearance"
    DELAYED = "delayed"
    DELIVERED = "delivered"


class TrackingEventTypeEnum(str, Enum):
    DEPARTED_ORIGIN = "departed_origin"
    ARRIVED_TRANSIT = "arrived_transit"
    DEPARTED_TRANSIT = "departed_transit"
    ARRIVED_DESTINATION = "arrived_destination"
    CUSTOMS_HOLD = "customs_hold"
    OUT_FOR_DELIVERY = "out_for_delivery"
    DELIVERED = "delivered"
    EXCEPTION = "exception"


# ── Pydantic 模型 ────────────────────────────────────────────────────


class Position(BaseModel):
    lat: float
    lon: float


class Shipment(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    blNumber: str
    origin: str
    destination: str
    cargoDesc: str
    hsCode: str
    status: ShipmentStatusEnum = ShipmentStatusEnum.IN_TRANSIT
    etd: datetime
    eta: datetime
    actualDeparture: Optional[datetime] = None
    actualArrival: Optional[datetime] = None
    vesselName: Optional[str] = None
    imoNumber: Optional[str] = None
    containerNumber: Optional[str] = None


class TrackingEvent(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    shipmentId: str
    eventType: TrackingEventTypeEnum
    location: str
    locationName: Optional[str] = None
    timestamp: datetime
    description: Optional[str] = None


class VesselInfo(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    imoNumber: str
    name: str
    callSign: str
    currentPosition: Position
    currentSpeed: float
    heading: int
    lastUpdated: datetime = Field(default_factory=datetime.utcnow)


class ShipmentTrackingResponse(BaseModel):
    shipment: Shipment
    events: list[TrackingEvent]
    vessel: Optional[VesselInfo] = None
    riskLevel: Optional[str] = None
    risks: list[str] = []


# ── 模拟数据（MVP 演示用） ──────────────────────────────────────────

MOCK_SHIPMENTS: dict[str, dict] = {
    "BL202606001": {
        "bl_number": "BL202606001",
        "origin": "CNSGH",
        "destination": "USLAX",
        "cargo_desc": "Cotton T-Shirts HS 610910",
        "hs_code": "610910",
        "status": "in_transit",
        "etd": "2026-06-15T08:00:00Z",
        "eta": "2026-07-12T20:00:00Z",
        "actual_departure": "2026-06-15T09:30:00Z",
        "actual_arrival": None,
        "vessel_name": "CMA CGM COLUMBIA",
        "imo_number": "9861234",
        "container_number": "CMAU4521890",
        "events": [
            {"event_type": "departed_origin", "location": "CNSGH", "timestamp": "2026-06-15T09:30:00Z", "description": "Departure from Shanghai"},
            {"event_type": "arrived_transit", "location": "SGSIN", "timestamp": "2026-06-19T14:00:00Z", "description": "Arrival at Singapore"},
            {"event_type": "departed_transit", "location": "SGSIN", "timestamp": "2026-06-20T06:00:00Z", "description": "Departure from Singapore"},
            {"event_type": "arrived_transit", "location": "KRPUS", "timestamp": "2026-06-22T11:00:00Z", "description": "Arrival at Busan"},
            {"event_type": "departed_transit", "location": "KRPUS", "timestamp": "2026-06-23T03:00:00Z", "description": "Departure from Busan"},
        ],
        "vessel": {
            "imo_number": "9861234",
            "name": "CMA CGM COLUMBIA",
            "call_sign": "FLLM",
            "current_lat": 35.5,
            "current_lon": 165.0,
            "current_speed": 18.5,
            "heading": 85,
        },
    },
    "BL202606002": {
        "bl_number": "BL202606002",
        "origin": "CNNGB",
        "destination": "NLRTM",
        "cargo_desc": "Lithium Batteries HS 850760",
        "hs_code": "850760",
        "status": "delayed",
        "etd": "2026-06-10T06:00:00Z",
        "eta": "2026-07-08T12:00:00Z",
        "actual_departure": "2026-06-10T08:00:00Z",
        "actual_arrival": None,
        "vessel_name": "MSC AURORA",
        "imo_number": "9723456",
        "container_number": "MSCU8890123",
        "events": [
            {"event_type": "departed_origin", "location": "CNNGB", "timestamp": "2026-06-10T08:00:00Z", "description": "Departure from Ningbo"},
            {"event_type": "arrived_transit", "location": "SGSIN", "timestamp": "2026-06-14T22:00:00Z", "description": "Arrival at Singapore"},
            {"event_type": "departed_transit", "location": "SGSIN", "timestamp": "2026-06-15T18:00:00Z", "description": "Departure from Singapore"},
            {"event_type": "exception", "location": "SGSIN", "timestamp": "2026-06-20T10:00:00Z", "description": "Vessel rerouted via Cape of Good Hope due to Red Sea situation"},
        ],
        "vessel": {
            "imo_number": "9723456",
            "name": "MSC AURORA",
            "call_sign": "V7A1234",
            "current_lat": -20.5,
            "current_lon": 65.0,
            "current_speed": 17.2,
            "heading": 260,
        },
    },
}


def get_mock_shipment(bl_number: str) -> Optional[dict]:
    """获取模拟货件数据"""
    return MOCK_SHIPMENTS.get(bl_number)


def get_mock_shipments_list() -> list[dict]:
    """获取所有模拟货件简要列表"""
    result = []
    for bl, data in MOCK_SHIPMENTS.items():
        result.append({
            "bl_number": bl,
            "origin": data["origin"],
            "destination": data["destination"],
            "cargo_desc": data["cargo_desc"],
            "status": data["status"],
            "etd": data["etd"],
            "eta": data["eta"],
        })
    return result
