"""
generate_sample_shipments.py — 生成模拟货物追踪数据

数据包含 12 票货物，涵盖主要航线、多种状态、关联风险事件。
港口代码和船名来自真实数据（MarineTraffic / VesselFinder 公开信息）。
"""

import json
import os
from datetime import datetime, timedelta

OUTPUT_DIR = "output"
OUTPUT_PATH = os.path.join(OUTPUT_DIR, "sample_shipments.json")


def build_shipments() -> list[dict]:
    now = datetime.utcnow()
    shipments = []

    # ══════════════════════════════════════════════════════════════════
    #  1. 上海 → 洛杉矶  (在途)
    # ══════════════════════════════════════════════════════════════════

    shipments.append({
        "bl_number": "HDMU4521890",
        "origin": "CNSHA",
        "destination": "USLAX",
        "cargo_desc": "Cotton T-Shirts 100% Cotton Knitted",
        "hs_code": "610910",
        "container_type": "40HQ",
        "container_number": "HDMU4521890",
        "status": "in_transit",
        "vessel_name": "CMA CGM COLUMBIA",
        "imo_number": "9861234",
        "voyage": "123W",
        "etd": "2026-06-15T08:00:00Z",
        "eta": "2026-07-12T20:00:00Z",
        "actual_departure": "2026-06-15T09:30:00Z",
        "actual_arrival": None,
        "carrier": "CMA CGM",
        "route": "东亚-北美西",
        "affected_by_risks": [],
        "events": [
            {"event_type": "departed_origin", "location": "CNSHA", "timestamp": "2026-06-15T09:30:00Z", "description": "Departed from Shanghai Yangshan Terminal"},
            {"event_type": "arrived_transit", "location": "KRPUS", "timestamp": "2026-06-18T06:00:00Z", "description": "Arrived at Busan New Port"},
            {"event_type": "departed_transit", "location": "KRPUS", "timestamp": "2026-06-19T02:00:00Z", "description": "Departed from Busan"},
            {"event_type": "arrived_transit", "location": "USLAX", "timestamp": None, "description": "Estimated arrival at Los Angeles APM Terminal"},
        ],
    })

    # ══════════════════════════════════════════════════════════════════
    #  2. 宁波 → 鹿特丹  (延误 — 红海绕行)
    # ══════════════════════════════════════════════════════════════════

    shipments.append({
        "bl_number": "MSCU8890123",
        "origin": "CNNGB",
        "destination": "NLRTM",
        "cargo_desc": "Lithium-ion Batteries for Electric Vehicles",
        "hs_code": "850760",
        "container_type": "40HQ",
        "container_number": "MSCU8890123",
        "status": "delayed",
        "vessel_name": "MSC AURORA",
        "imo_number": "9723456",
        "voyage": "FL456W",
        "etd": "2026-06-10T06:00:00Z",
        "eta": "2026-07-08T12:00:00Z",
        "actual_departure": "2026-06-10T08:00:00Z",
        "actual_arrival": None,
        "carrier": "MSC",
        "route": "东亚-欧洲",
        "affected_by_risks": ["red_sea_crisis"],
        "events": [
            {"event_type": "departed_origin", "location": "CNNGB", "timestamp": "2026-06-10T08:00:00Z", "description": "Departed from Ningbo Zhoushan Terminal"},
            {"event_type": "arrived_transit", "location": "SGSIN", "timestamp": "2026-06-14T22:00:00Z", "description": "Arrived at Singapore Pasir Panjang Terminal"},
            {"event_type": "departed_transit", "location": "SGSIN", "timestamp": "2026-06-15T18:00:00Z", "description": "Departed from Singapore"},
            {"event_type": "exception", "location": "SGSIN", "timestamp": "2026-06-20T10:00:00Z", "description": "Vessel rerouted via Cape of Good Hope due to Red Sea situation. ETA revised."},
            {"event_type": "arrived_transit", "location": "ZACPT", "timestamp": None, "description": "Vessel rounding Cape of Good Hope, estimated +10 days delay"},
        ],
    })

    # ══════════════════════════════════════════════════════════════════
    #  3. 深圳 → 汉堡  (在途)
    # ══════════════════════════════════════════════════════════════════

    shipments.append({
        "bl_number": "COSU7894561",
        "origin": "CNYTN",
        "destination": "DEHAM",
        "cargo_desc": "Household Electronics Smart Speakers",
        "hs_code": "851840",
        "container_type": "40GP",
        "container_number": "COSU7894561",
        "status": "in_transit",
        "vessel_name": "OOCL EUROPE",
        "imo_number": "9776171",
        "voyage": "012W",
        "etd": "2026-06-18T12:00:00Z",
        "eta": "2026-07-22T06:00:00Z",
        "actual_departure": "2026-06-18T14:00:00Z",
        "actual_arrival": None,
        "carrier": "COSCO",
        "route": "东亚-欧洲",
        "affected_by_risks": ["red_sea_crisis"],
        "events": [
            {"event_type": "departed_origin", "location": "CNYTN", "timestamp": "2026-06-18T14:00:00Z", "description": "Departed from Yantian International Terminal"},
            {"event_type": "arrived_transit", "location": "SGSIN", "timestamp": "2026-06-22T18:00:00Z", "description": "Transit at Singapore"},
            {"event_type": "departed_transit", "location": "SGSIN", "timestamp": "2026-06-23T06:00:00Z", "description": "Departed Singapore via Cape of Good Hope routing"},
            {"event_type": "arrived_transit", "location": "DEHAM", "timestamp": None, "description": "Estimated arrival at Hamburg Container Terminal Burchardkai"},
        ],
    })

    # ══════════════════════════════════════════════════════════════════
    #  4. 青岛 → 曼谷  (清关中)
    # ══════════════════════════════════════════════════════════════════

    shipments.append({
        "bl_number": "MAEU5678901",
        "origin": "CNTAO",
        "destination": "THLCH",
        "cargo_desc": "Frozen Seafood Products (Shrimp)",
        "hs_code": "030617",
        "container_type": "40RH",
        "container_number": "MAEU5678901",
        "status": "customs_clearance",
        "vessel_name": "MAERSK SEMAKAU",
        "imo_number": "9299981",
        "voyage": "345S",
        "etd": "2026-06-05T04:00:00Z",
        "eta": "2026-06-14T10:00:00Z",
        "actual_departure": "2026-06-05T06:00:00Z",
        "actual_arrival": "2026-06-14T08:30:00Z",
        "carrier": "Maersk",
        "route": "东亚-东南亚",
        "affected_by_risks": [],
        "events": [
            {"event_type": "departed_origin", "location": "CNTAO", "timestamp": "2026-06-05T06:00:00Z", "description": "Departed from Qingdao Qianwan Terminal"},
            {"event_type": "arrived_transit", "location": "HKHKG", "timestamp": "2026-06-08T14:00:00Z", "description": "Transit at Hong Kong"},
            {"event_type": "departed_transit", "location": "HKHKG", "timestamp": "2026-06-09T02:00:00Z", "description": "Departed Hong Kong"},
            {"event_type": "arrived_destination", "location": "THLCH", "timestamp": "2026-06-14T08:30:00Z", "description": "Arrived at Laem Chabang Terminal A2"},
            {"event_type": "customs_hold", "location": "THLCH", "timestamp": "2026-06-15T09:00:00Z", "description": "Customs inspection initiated — frozen product documentation review"},
        ],
    })

    # ══════════════════════════════════════════════════════════════════
    #  5. 天津 → 杰贝阿里  (已交付)
    # ══════════════════════════════════════════════════════════════════

    shipments.append({
        "bl_number": "HDMU3322110",
        "origin": "CNTSN",
        "destination": "AEFJR",
        "cargo_desc": "Construction Steel Rebars",
        "hs_code": "721420",
        "container_type": "20GP",
        "container_number": "HDMU3322110",
        "status": "delivered",
        "vessel_name": "EVER GIVEN",
        "imo_number": "9811000",
        "voyage": "078E",
        "etd": "2026-05-01T10:00:00Z",
        "eta": "2026-05-28T16:00:00Z",
        "actual_departure": "2026-05-01T12:00:00Z",
        "actual_arrival": "2026-05-28T14:00:00Z",
        "carrier": "Hapag-Lloyd",
        "route": "东亚-中东",
        "affected_by_risks": [],
        "events": [
            {"event_type": "departed_origin", "location": "CNTSN", "timestamp": "2026-05-01T12:00:00Z", "description": "Departed from Tianjin Xingang Terminal"},
            {"event_type": "arrived_transit", "location": "SGSIN", "timestamp": "2026-05-10T08:00:00Z", "description": "Transit at Singapore"},
            {"event_type": "departed_transit", "location": "SGSIN", "timestamp": "2026-05-11T04:00:00Z", "description": "Departed Singapore"},
            {"event_type": "arrived_destination", "location": "AEFJR", "timestamp": "2026-05-28T14:00:00Z", "description": "Arrived at Jebel Ali Terminal 2"},
            {"event_type": "out_for_delivery", "location": "AEFJR", "timestamp": "2026-05-29T08:00:00Z", "description": "Container released and out for delivery"},
            {"event_type": "delivered", "location": "AEFJR", "timestamp": "2026-05-30T16:00:00Z", "description": "Signed and delivered to consignee warehouse"},
        ],
    })

    # ══════════════════════════════════════════════════════════════════
    #  6. 厦门 → 纽约  (在途 — 可能受巴拿马运河影响)
    # ══════════════════════════════════════════════════════════════════

    shipments.append({
        "bl_number": "OOLU1234567",
        "origin": "CNXMN",
        "destination": "USNYC",
        "cargo_desc": "Sports Footwear Leather Upper",
        "hs_code": "640319",
        "container_type": "40HQ",
        "container_number": "OOLU1234567",
        "status": "in_transit",
        "vessel_name": "OOCL BERLIN",
        "imo_number": "9780123",
        "voyage": "045E",
        "etd": "2026-06-20T06:00:00Z",
        "eta": "2026-07-25T12:00:00Z",
        "actual_departure": "2026-06-20T08:00:00Z",
        "actual_arrival": None,
        "carrier": "OOCL",
        "route": "东亚-北美东",
        "affected_by_risks": ["panama_canal_drought"],
        "events": [
            {"event_type": "departed_origin", "location": "CNXMN", "timestamp": "2026-06-20T08:00:00Z", "description": "Departed from Xiamen Haitian Terminal"},
            {"event_type": "arrived_transit", "location": "COBAL", "timestamp": None, "description": "ETA Balboa — Panama Canal transit scheduled"},
            {"event_type": "exception", "location": "COBAL", "timestamp": None, "description": "Panama Canal draft restriction under review — may require lightening"},
        ],
    })

    # ══════════════════════════════════════════════════════════════════
    #  7. 上海 → 新加坡  (已交付 — 短途)
    # ══════════════════════════════════════════════════════════════════

    shipments.append({
        "bl_number": "COSU1239876",
        "origin": "CNSHA",
        "destination": "SGSIN",
        "cargo_desc": "Processed Food Seasoning Packets",
        "hs_code": "210390",
        "container_type": "20GP",
        "container_number": "COSU1239876",
        "status": "delivered",
        "vessel_name": "KMTC DUBAI",
        "imo_number": "9110234",
        "voyage": "078S",
        "etd": "2026-06-08T18:00:00Z",
        "eta": "2026-06-14T06:00:00Z",
        "actual_departure": "2026-06-08T20:00:00Z",
        "actual_arrival": "2026-06-14T04:00:00Z",
        "carrier": "COSCO",
        "route": "东亚-东南亚",
        "affected_by_risks": [],
        "events": [
            {"event_type": "departed_origin", "location": "CNSHA", "timestamp": "2026-06-08T20:00:00Z", "description": "Departed Shanghai Waigaoqiao Terminal"},
            {"event_type": "arrived_destination", "location": "SGSIN", "timestamp": "2026-06-14T04:00:00Z", "description": "Arrived at Singapore Pasir Panjang Terminal"},
            {"event_type": "out_for_delivery", "location": "SGSIN", "timestamp": "2026-06-15T10:00:00Z", "description": "Customs cleared, container released"},
            {"event_type": "delivered", "location": "SGSIN", "timestamp": "2026-06-16T14:00:00Z", "description": "Delivered to consignee warehouse in Jurong"},
        ],
    })

    # ══════════════════════════════════════════════════════════════════
    #  8. 釜山 → 洛杉矶  (在途)
    # ══════════════════════════════════════════════════════════════════

    shipments.append({
        "bl_number": "MAEU9988776",
        "origin": "KRPUS",
        "destination": "USLAX",
        "cargo_desc": "Automotive Components Electronic Control Units",
        "hs_code": "853710",
        "container_type": "40GP",
        "container_number": "MAEU9988776",
        "status": "in_transit",
        "vessel_name": "MAERSK EINDHOVEN",
        "imo_number": "9876543",
        "voyage": "234W",
        "etd": "2026-06-22T16:00:00Z",
        "eta": "2026-07-08T10:00:00Z",
        "actual_departure": "2026-06-22T18:00:00Z",
        "actual_arrival": None,
        "carrier": "Maersk",
        "route": "东亚-北美西",
        "affected_by_risks": [],
        "events": [
            {"event_type": "departed_origin", "location": "KRPUS", "timestamp": "2026-06-22T18:00:00Z", "description": "Departed from Busan New Port"},
            {"event_type": "arrived_transit", "location": "USLAX", "timestamp": None, "description": "Direct sailing, ETA Los Angeles"},
        ],
    })

    # ══════════════════════════════════════════════════════════════════
    #  9. 胡志明 → 汉堡  (延误 — 新加坡港拥堵)
    # ══════════════════════════════════════════════════════════════════

    shipments.append({
        "bl_number": "HDMU5566778",
        "origin": "VNHCM",
        "destination": "DEHAM",
        "cargo_desc": "Coffee Beans Arabica Green",
        "hs_code": "090111",
        "container_type": "20GP",
        "container_number": "HDMU5566778",
        "status": "delayed",
        "vessel_name": "HAPAG LLOYD STELLA",
        "imo_number": "9345678",
        "voyage": "012W",
        "etd": "2026-06-12T08:00:00Z",
        "eta": "2026-07-15T14:00:00Z",
        "actual_departure": "2026-06-12T10:00:00Z",
        "actual_arrival": None,
        "carrier": "Hapag-Lloyd",
        "route": "东南亚-欧洲",
        "affected_by_risks": ["red_sea_crisis", "singapore_congestion"],
        "events": [
            {"event_type": "departed_origin", "location": "VNHCM", "timestamp": "2026-06-12T10:00:00Z", "description": "Departed from Ho Chi Minh Cat Lai Terminal"},
            {"event_type": "arrived_transit", "location": "SGSIN", "timestamp": "2026-06-15T06:00:00Z", "description": "Arrived Singapore — awaiting berth due to congestion"},
            {"event_type": "exception", "location": "SGSIN", "timestamp": "2026-06-17T08:00:00Z", "description": "Extended wait at Singapore — congestion delay of approx. 3 days"},
            {"event_type": "departed_transit", "location": "SGSIN", "timestamp": "2026-06-19T22:00:00Z", "description": "Departed Singapore — routing via Cape of Good Hope"},
        ],
    })

    # ══════════════════════════════════════════════════════════════════
    #  10. 东京 → 西雅图  (在途)
    # ══════════════════════════════════════════════════════════════════

    shipments.append({
        "bl_number": "NYKU3344556",
        "origin": "JPYOK",
        "destination": "USSEA",
        "cargo_desc": "Semiconductor Manufacturing Equipment Parts",
        "hs_code": "848690",
        "container_type": "40GP",
        "container_number": "NYKU3344556",
        "status": "in_transit",
        "vessel_name": "NYK LAYA",
        "imo_number": "9678901",
        "voyage": "056E",
        "etd": "2026-06-25T04:00:00Z",
        "eta": "2026-07-10T18:00:00Z",
        "actual_departure": "2026-06-25T06:00:00Z",
        "actual_arrival": None,
        "carrier": "NYK Line",
        "route": "东亚-北美西",
        "affected_by_risks": [],
        "events": [
            {"event_type": "departed_origin", "location": "JPYOK", "timestamp": "2026-06-25T06:00:00Z", "description": "Departed from Yokohama Honmoku Terminal"},
            {"event_type": "arrived_transit", "location": "USSEA", "timestamp": None, "description": "Direct Pacific crossing, ETA Seattle T-18 Terminal"},
        ],
    })

    # ══════════════════════════════════════════════════════════════════
    #  11. 蛇口 → 悉尼  (清关中)
    # ══════════════════════════════════════════════════════════════════

    shipments.append({
        "bl_number": "MAEU1122334",
        "origin": "CNSHK",
        "destination": "AUSYD",
        "cargo_desc": "Furniture Wooden Bed Frames",
        "hs_code": "940350",
        "container_type": "40HQ",
        "container_number": "MAEU1122334",
        "status": "customs_clearance",
        "vessel_name": "MAERSK KAWASAKI",
        "imo_number": "9456789",
        "voyage": "112S",
        "etd": "2026-06-01T06:00:00Z",
        "eta": "2026-06-20T08:00:00Z",
        "actual_departure": "2026-06-01T08:00:00Z",
        "actual_arrival": "2026-06-20T06:00:00Z",
        "carrier": "Maersk",
        "route": "东亚-澳新",
        "affected_by_risks": [],
        "events": [
            {"event_type": "departed_origin", "location": "CNSHK", "timestamp": "2026-06-01T08:00:00Z", "description": "Departed from Shekou Container Terminal"},
            {"event_type": "arrived_transit", "location": "SGSIN", "timestamp": "2026-06-05T14:00:00Z", "description": "Transit at Singapore"},
            {"event_type": "departed_transit", "location": "SGSIN", "timestamp": "2026-06-06T04:00:00Z", "description": "Departed Singapore"},
            {"event_type": "arrived_destination", "location": "AUSYD", "timestamp": "2026-06-20T06:00:00Z", "description": "Arrived at Sydney Port Botany Terminal"},
            {"event_type": "customs_hold", "location": "AUSYD", "timestamp": "2026-06-21T09:00:00Z", "description": "AQIS biosecurity inspection — wooden packaging verification"},
        ],
    })

    # ══════════════════════════════════════════════════════════════════
    #  12. 高雄 → 温哥华  (在途)
    # ══════════════════════════════════════════════════════════════════

    shipments.append({
        "bl_number": "OOLU9988001",
        "origin": "TWTXG",
        "destination": "CAVAN",
        "cargo_desc": "Bicycle Parts & Accessories",
        "hs_code": "871491",
        "container_type": "20GP",
        "container_number": "OOLU9988001",
        "status": "in_transit",
        "vessel_name": "OOCL BRUSSELS",
        "imo_number": "9567890",
        "voyage": "067W",
        "etd": "2026-06-19T10:00:00Z",
        "eta": "2026-07-14T06:00:00Z",
        "actual_departure": "2026-06-19T12:00:00Z",
        "actual_arrival": None,
        "carrier": "OOCL",
        "route": "东亚-北美西",
        "affected_by_risks": [],
        "events": [
            {"event_type": "departed_origin", "location": "TWTXG", "timestamp": "2026-06-19T12:00:00Z", "description": "Departed from Kaohsiung Port Terminal 5"},
            {"event_type": "arrived_transit", "location": "CAVAN", "timestamp": None, "description": "ETA Vancouver Centerm Terminal"},
        ],
    })

    return shipments


def main():
    shipments = build_shipments()

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(shipments, f, ensure_ascii=False, indent=2)

    print(f"✅ 已写入 {OUTPUT_PATH}")
    print(f"\n📋 货物清单（{len(shipments)} 票）：")
    print()

    status_count: dict[str, int] = {}
    for s in shipments:
        st = s["status"]
        status_count[st] = status_count.get(st, 0) + 1
        risk_tag = " 🔴" if s["affected_by_risks"] else ""
        ev_count = len([e for e in s["events"] if e["timestamp"] is not None])
        eta_short = s["eta"][:10]
        print(f"  {s['bl_number']}  {s['origin']:6s} → {s['destination']:6s}  "
              f"[{s['status']:>16s}]{risk_tag}  ETA {eta_short}  "
              f"{ev_count} events  {s['cargo_desc'][:30]}")

    print()
    print("  状态分布：")
    for st, c in sorted(status_count.items()):
        print(f"    {st}: {c} 票")
    print()
    print("  受风险事件影响：")
    affected = [s for s in shipments if s["affected_by_risks"]]
    for s in affected:
        print(f"    🔴 {s['bl_number']} — {', '.join(s['affected_by_risks'])}")
    if not affected:
        print("    无")


if __name__ == "__main__":
    main()
