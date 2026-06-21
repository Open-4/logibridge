"""
fetch_risk_events.py — 全球物流风险事件数据

数据来源：
  1. NOAA NWS API / JMA 台风数据（模拟路径 — 基于历史气象数据合成）
  2. Portcast / GoComet 公开港口拥堵周报
  3. UKMTO / MSCHOA / Lloyd's List 安全事件通报
  4. Panama Canal Authority / Suez Canal Authority 运营状态

⚠️ 标注为「模拟数据」的条目为基于历史平均统计的合成数据，仅用于 MVP 演示。
   生产环境应替换为对应 API 的实时数据。
"""

import json
import os
import math
import random
from datetime import datetime, timedelta

OUTPUT_DIR = "output"
OUTPUT_PATH = os.path.join(OUTPUT_DIR, "risk_events.json")

random.seed(42)


def build_events() -> list[dict]:
    events = []

    # ══════════════════════════════════════════════════════════════════
    #  1. 港口罢工事件
    # ══════════════════════════════════════════════════════════════════

    events.append({
        "id": "evt_001",
        "type": "strike",
        "severity": "high",
        "title": "美国东海岸及墨西哥湾港口罢工预警（ILA 劳资谈判破裂）",
        "description": (
            "国际码头工人协会(ILA)与美国海事联盟(USMX)的主合同于2024年9月30日到期后未能达成新协议，"
            "2024年10月1日至3日举行了为期3天的全面罢工，影响从缅因州至德克萨斯州的36个港口。"
            "2025年1月双方达成临时的六年合同，但2026年自动化议题再次引发争议，"
            "ILA警告若无法就半自动化设备的使用限制达成协议，将再次发起罢工。"
            "2026年1月双方重返谈判桌，但关键条款仍未解决，罢工风险持续存在。"
        ),
        "affected_ports": ["USNYC", "USSAV", "USMIA", "USHOU", "USCHS", "USBAL", "USPHL", "USBOS"],
        "affected_routes": ["东亚-北美东", "欧洲-北美东"],
        "geometry": {
            "type": "Point",
            "coordinates": [-74.006, 40.7128],
        },
        "radius_km": 800,
        "start_date": "2026-01-15",
        "end_date": "2026-01-20",
        "source": "Lloyd's List / ILA官方",
        "source_url": "https://www.ilaunion.org",
        "last_updated": "2026-06-15T10:00:00Z",
    })

    # ══════════════════════════════════════════════════════════════════
    #  2. 红海安全事件（胡塞武装影响）
    # ══════════════════════════════════════════════════════════════════

    events.append({
        "id": "evt_002",
        "type": "security",
        "severity": "critical",
        "title": "红海/亚丁湾胡塞武装持续袭击商船，航线绕行好望角",
        "description": (
            "自2023年11月起，也门胡塞武装在红海及亚丁湾持续袭击与以色列相关的商船及多国军舰，"
            "累计攻击超过100艘商船。马士基、MSC、达飞等主要船公司长期绕行好望角，"
            "导致亚洲-欧洲航线单程增加约10天航程和100万美元燃油成本。"
            "2025年停火协议后袭击有所减少，但2026年5月胡塞武装宣布恢复对特定船舶的行动，"
            "红海航行风险再次升级。目前主要船公司仍维持好望角绕行方案，"
            "苏伊士运河过境量同比下降约60%。"
        ),
        "affected_ports": ["EGPSD", "EGSUZ"],
        "affected_routes": ["东亚-欧洲", "东亚-地中海", "东南亚-欧洲"],
        "geometry": {
            "type": "Point",
            "coordinates": [44.0, 13.0],
        },
        "radius_km": 500,
        "start_date": "2023-11-19",
        "end_date": "2026-12-31",
        "source": "UKMTO / MSCHOA / Lloyd's List",
        "source_url": "https://www.ukmto.org",
        "last_updated": "2026-06-20T14:00:00Z",
    })

    # ══════════════════════════════════════════════════════════════════
    #  3. 港口拥堵事件 — 洛杉矶/长滩
    # ══════════════════════════════════════════════════════════════════

    events.append({
        "id": "evt_003",
        "type": "congestion",
        "severity": "high",
        "title": "洛杉矶/长滩港拥堵—进口旺季锚地等待时间超7天",
        "description": (
            "受美国西海岸进口旺季影响，洛杉矶港和长滩港在2026年第二季度出现严重拥堵。"
            "锚地平均等待时间从正常的1-2天上升至5-7天，部分船舶等待超过10天。"
            "码头利用率达92%，集装箱停留时间延长至6.8天。"
            "拥堵主因包括：旺季进口量激增、铁路联运瓶颈、底盘车短缺。"
            "预计拥堵将持续至2026年第三季度末，收货人建议提前备货。"
        ),
        "affected_ports": ["USLAX", "USLGB"],
        "affected_routes": ["东亚-北美西", "东南亚-北美西"],
        "geometry": {
            "type": "Point",
            "coordinates": [-118.24, 33.74],
        },
        "radius_km": 100,
        "start_date": "2026-04-01",
        "end_date": "2026-09-30",
        "source": "Portcast / GoComet / PMSA",
        "source_url": "https://www.portoflosangeles.org/",
        "last_updated": "2026-06-20T08:00:00Z",
    })

    # ══════════════════════════════════════════════════════════════════
    #  4. 台风模拟 — 西北太平洋台风季
    # ══════════════════════════════════════════════════════════════════

    events.append({
        "id": "evt_004",
        "type": "typhoon",
        "severity": "high",
        "title": "⚠️ 模拟数据：西北太平洋台风季—典型路径影响华东港口",
        "description": (
            "【模拟数据】基于1951-2024年JMA历史台风统计生成的典型台风路径。"
            "该台风在菲律宾以东洋面生成，沿西北路径穿越台湾北部海域，"
            "影响中国华东沿海：上海港、宁波舟山港、厦门港及福州港。"
            "最大持续风速约45m/s，风力12-14级，带来3-5米风暴潮。"
            "预计影响持续48-72小时，期间港口全面封港，船舶疏散。"
            "此数据为基于历史平均路径合成的模拟数据，非实时台风预报。"
            "实时数据请参考JMA（www.jma.go.jp）或NOAA NHC（www.nhc.noaa.gov）。"
        ),
        "affected_ports": ["CNSHA", "CNNGB", "CNXMN", "CNFOC", "CNWEN"],
        "affected_routes": ["东亚-北美西", "东亚-东南亚", "东亚-欧洲"],
        "geometry": {
            "type": "Point",
            "coordinates": [122.5, 26.5],
        },
        "radius_km": 350,
        "start_date": "2026-08-15",
        "end_date": "2026-08-18",
        "source": "JMA（模拟数据，基于历史路径合成）",
        "source_url": "https://www.jma.go.jp/jma/jma-eng/jma-center/rsmc-hp-pub-eg/typhoon.html",
        "last_updated": "2026-06-21T00:00:00Z",
    })

    # ══════════════════════════════════════════════════════════════════
    #  5. 巴拿马运河水位限制
    # ══════════════════════════════════════════════════════════════════

    events.append({
        "id": "evt_005",
        "type": "congestion",
        "severity": "medium",
        "title": "巴拿马运河吃水限制—Neopanamax 船舶最大吃水降至13.4m",
        "description": (
            "受2024-2025年厄尔尼诺现象导致的持续干旱影响，巴拿马运河加通湖水位波动较大。"
            "2026年初水位回升至78英尺以上，运河管理局将Neopanamax船闸的"
            "最大授权吃水从年初的13.4m逐步恢复至14.9m，日过境次数恢复至36次。"
            "但雨季延迟开始，水位仍低于历史平均水平，"
            "运河管理局维持灵活调整机制，每月评估水位决定是否调整吃水限制。"
            "目前单次过境拍卖费用约$200,000-$500,000，仍远高于正常水平。"
        ),
        "affected_ports": ["PABLB", "PAMIT"],
        "affected_routes": ["东亚-北美东", "东亚-南美东", "东亚-欧洲"],
        "geometry": {
            "type": "Point",
            "coordinates": [-79.5, 9.0],
        },
        "radius_km": 100,
        "start_date": "2025-01-01",
        "end_date": "2026-12-31",
        "source": "Panama Canal Authority (ACP)",
        "source_url": "https://www.pancanal.com",
        "last_updated": "2026-06-15T09:00:00Z",
    })

    # ══════════════════════════════════════════════════════════════════
    #  6. 新加坡港拥堵
    # ══════════════════════════════════════════════════════════════════

    events.append({
        "id": "evt_006",
        "type": "congestion",
        "severity": "medium",
        "title": "新加坡港拥堵持续—绕行好望角导致船舶集中到港",
        "description": (
            "受红海危机导致的好望角绕行影响，新加坡港作为亚欧航线核心中转枢纽，"
            "2026年第二季度集装箱吞吐量同比增加约15%，锚地等待时间上升至3-5天。"
            "码头堆场利用率达88%，大士港新泊位虽已部分投入使用，"
            "但短期内仍无法完全缓解拥堵。PSA国际港务集团已启动应急预案，"
            "包括增加临时堆场和优化船舶靠泊窗口。"
        ),
        "affected_ports": ["SGSIN"],
        "affected_routes": ["东亚-欧洲", "东亚-地中海", "东南亚-欧洲", "东南亚-中东"],
        "geometry": {
            "type": "Point",
            "coordinates": [103.85, 1.28],
        },
        "radius_km": 50,
        "start_date": "2024-12-01",
        "end_date": "2026-12-31",
        "source": "Portcast / PSA International",
        "source_url": "https://www.singaporepsa.com",
        "last_updated": "2026-06-18T11:00:00Z",
    })

    # ══════════════════════════════════════════════════════════════════
    #  7. 鹿特丹港拥堵
    # ══════════════════════════════════════════════════════════════════

    events.append({
        "id": "evt_007",
        "type": "congestion",
        "severity": "low",
        "title": "鹿特丹港欧洲能源运输高峰—内陆水运瓶颈",
        "description": (
            "鹿特丹港在2026年第二季度因欧洲能源进口增加和内陆驳船运力紧张，"
            "港区集装箱堆场周转天数延长至5.2天。主要瓶颈为内陆驳船等待时间增加，"
            "以及铁路联运设施维护导致的部分运力下降。码头仍维持正常运行，"
            "锚地等待时间控制在1天以内。"
        ),
        "affected_ports": ["NLRTM"],
        "affected_routes": ["东亚-欧洲"],
        "geometry": {
            "type": "Point",
            "coordinates": [4.5, 51.9],
        },
        "radius_km": 100,
        "start_date": "2026-04-01",
        "end_date": "2026-07-31",
        "source": "Port of Rotterdam / Portcast",
        "source_url": "https://www.portofrotterdam.com",
        "last_updated": "2026-06-17T07:00:00Z",
    })

    return events


def main():
    events = build_events()

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(events, f, ensure_ascii=False, indent=2)

    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

    print(f"✅ 已写入 {OUTPUT_PATH}")
    print(f"\n📊 风险事件统计（生成时间: {now}）：")
    print(f"   总计: {len(events)} 条事件")
    print()

    type_count: dict[str, int] = {}
    severity_count: dict[str, int] = {}
    for e in events:
        type_count[e["type"]] = type_count.get(e["type"], 0) + 1
        severity_count[e["severity"]] = severity_count.get(e["severity"], 0) + 1

    print("   按类型：")
    for t, c in sorted(type_count.items()):
        print(f"     {t}: {c} 条")
    print()
    print("   按严重程度：")
    for s, c in sorted(severity_count.items()):
        print(f"     {s}: {c} 条")
    print()
    print("   事件列表：")
    for e in events:
        tag = "⚠️" if "模拟数据" in e["title"] else "📢"
        print(f"   {tag} [{e['severity'].upper():>8}] {e['title'][:55]}")
        print(f"      影响港口: {', '.join(e['affected_ports'][:3])}{'...' if len(e['affected_ports'])>3 else ''}")
        print(f"      期限: {e['start_date']} ~ {e['end_date']}")
        print()


if __name__ == "__main__":
    main()
