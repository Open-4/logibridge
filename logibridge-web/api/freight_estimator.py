"""
freight_estimator.py — 海运运费估算模型

基于起运港‑目的港的区域组合、集装箱类型和当前市场基准，估算海运门‑港综合运费。
"""

# ── 常量定义 ────────────────────────────────────────────────────────────

# 港口 → 区域映射
PORT_REGION_MAP = {
    # EA 东亚
    "CNHKG": "EA", "CNSHA": "EA", "CNSGH": "EA", "CNNGB": "EA", "CNXMN": "EA", "CNYTN": "EA",
    "KRPUS": "EA", "JPYOK": "EA", "TWTXG": "EA",
    # SEA 东南亚 / 大洋洲
    "SGSIN": "SEA", "MYPGK": "SEA", "THLCH": "SEA", "VNHCM": "SEA",
    "IDJKT": "SEA", "PHMNL": "SEA", "AUSYD": "SEA", "AUMEL": "SEA", "NZAKL": "SEA",
    # MESA 中东 / 南亚
    "AEFJR": "MESA", "SAJED": "MESA", "OMSOO": "MESA", "INNSA": "MESA",
    "INMAA": "MESA", "LKBJM": "MESA", "PKKHI": "MESA",
    # EU 欧洲 / 地中海
    "NLRTM": "EU", "DEHAM": "EU", "BEANR": "EU", "GBFXT": "EU",
    "FRLEH": "EU", "ESBCN": "EU", "ITGIT": "EU", "TRISK": "EU",
    # NA 北美
    "USLAX": "NA", "USLGB": "NA", "USSEA": "NA", "USNYC": "NA",
    "USSAV": "NA", "CAVAN": "NA", "MXVER": "NA",
    # SAMAF 南美 / 非洲
    "BRSSZ": "SAMAF", "BRRIO": "SAMAF", "ARBUE": "SAMAF",
    "CLVAP": "SAMAF", "PEZLO": "SAMAF", "ZADUR": "SAMAF",
    "ZACPT": "SAMAF", "NGTIN": "SAMAF", "KEMBA": "SAMAF",
}

# 区域间距离系数矩阵
REGION_MATRIX = {
    ("EA", "EA"): 0.45, ("EA", "SEA"): 0.60, ("EA", "MESA"): 0.80,
    ("EA", "EU"): 0.95, ("EA", "NA"): 1.00, ("EA", "SAMAF"): 1.20,
    ("SEA", "EA"): 0.60, ("SEA", "SEA"): 0.40, ("SEA", "MESA"): 0.70,
    ("SEA", "EU"): 0.90, ("SEA", "NA"): 0.95, ("SEA", "SAMAF"): 1.10,
    ("MESA", "EA"): 0.80, ("MESA", "SEA"): 0.70, ("MESA", "MESA"): 0.50,
    ("MESA", "EU"): 0.75, ("MESA", "NA"): 0.85, ("MESA", "SAMAF"): 1.00,
    ("EU", "EA"): 0.95, ("EU", "SEA"): 0.90, ("EU", "MESA"): 0.75,
    ("EU", "EU"): 0.50, ("EU", "NA"): 0.90, ("EU", "SAMAF"): 1.05,
    ("NA", "EA"): 1.00, ("NA", "SEA"): 0.95, ("NA", "MESA"): 0.85,
    ("NA", "EU"): 0.90, ("NA", "NA"): 0.55, ("NA", "SAMAF"): 1.15,
    ("SAMAF", "EA"): 1.20, ("SAMAF", "SEA"): 1.10, ("SAMAF", "MESA"): 1.00,
    ("SAMAF", "EU"): 1.05, ("SAMAF", "NA"): 1.15, ("SAMAF", "SAMAF"): 0.60,
}

# 集装箱倍数
CONTAINER_MULTIPLIER = {"20GP": 1.0, "40GP": 2.0, "40HQ": 2.0}

# 拥堵费港口列表（北美西岸）
CONGESTION_PORTS = {"USLAX", "USLGB", "USSEA"}

# 基准运价（EA → NA，20GP）
DEFAULT_BASE_RATE_20GP = 1500.0


# ── 核心函数 ────────────────────────────────────────────────────────────

def estimate_freight(
    origin_port_code: str,
    destination_port_code: str,
    container_type: str,
    base_rate_20gp: float = DEFAULT_BASE_RATE_20GP,
) -> dict:
    """
    估算海运运费。

    Args:
        origin_port_code:      起运港代码（如 'CNSHA'）
        destination_port_code: 目的港代码（如 'USLAX'）
        container_type:        '20GP' / '40GP' / '40HQ'
        base_rate_20gp:        基准航线（EA→NA）的 20GP 运价（USD）

    Returns:
        dict: {
            'base_freight':        float,   # 基准海运费
            'baf':                 float,   # 燃油附加费
            'lsf':                 float,   # 低硫附加费
            'congestion_surcharge': float,  # 港口拥堵费
            'total':               float,   # 总费用
        }

    Raises:
        ValueError: 港口代码或集装箱类型不支持
    """
    code_o = origin_port_code.upper()
    code_d = destination_port_code.upper()

    # 1. 查找区域
    o_region = PORT_REGION_MAP.get(code_o)
    d_region = PORT_REGION_MAP.get(code_d)
    if o_region is None:
        raise ValueError(f"不支持的起运港代码: {origin_port_code}")
    if d_region is None:
        raise ValueError(f"不支持的目的港代码: {destination_port_code}")

    # 2. 集装箱倍数
    c_mult = CONTAINER_MULTIPLIER.get(container_type)
    if c_mult is None:
        raise ValueError(
            f"不支持的集装箱类型: {container_type}，仅支持 20GP/40GP/40HQ"
        )

    # 3. 距离系数
    factor = REGION_MATRIX.get((o_region, d_region))
    if factor is None:
        raise ValueError(f"无可用距离系数: {o_region} → {d_region}")

    # 4. 基准海运费
    base_freight = base_rate_20gp * c_mult * factor

    # 5. 附加费
    baf = base_freight * 0.15   # 燃油附加费 15%
    lsf = base_freight * 0.08   # 低硫附加费 8%

    # 6. 拥堵费（北美西岸港口）
    congestion_surcharge = 200.0 if (code_o in CONGESTION_PORTS or code_d in CONGESTION_PORTS) else 0.0

    # 7. 总费用
    total = base_freight + baf + lsf + congestion_surcharge

    return {
        "base_freight": round(base_freight, 2),
        "baf": round(baf, 2),
        "lsf": round(lsf, 2),
        "congestion_surcharge": round(congestion_surcharge, 2),
        "total": round(total, 2),
    }


# ── 入口与测试 ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 56)
    print("  海运运费估算引擎")
    print("=" * 56)

    test_cases = [
        # (场景, 起运港, 目的港, 箱型, 说明)
        ("上海 → 洛杉矶",  "CNSHA", "USLAX", "40HQ",  "EA→NA, 40HQ, 有拥堵费"),
        ("新加坡 → 鹿特丹", "SGSIN", "NLRTM", "20GP",  "SEA→EU, 20GP, 无拥堵费"),
        ("上海 → 新加坡",  "CNSHA", "SGSIN", "40GP",  "EA→SEA, 40GP"),
        ("釜山 → 纽约",    "KRPUS", "USNYC", "40HQ",  "EA→NA, 40HQ, 无拥堵费"),
        ("迪拜 → 上海",    "AEFJR", "CNSHA", "20GP",  "MESA→EA, 20GP"),
        ("桑托斯 → 汉堡",  "BRSSZ", "DEHAM", "40GP",  "SAMAF→EU, 40GP"),
    ]

    for label, o, d, ct, note in test_cases:
        try:
            r = estimate_freight(o, d, ct)
            print(f"\n{'─' * 56}")
            print(f"  {label}  ({note})")
            print(f"  起运港: {o:>6s} → 目的港: {d:>6s}  |  箱型: {ct}")
            print(f"  {'─' * 40}")
            print(f"    基准海运费 (Base Freight):     ${r['base_freight']:>8.2f}")
            print(f"    燃油附加费 (BAF, 15%):         ${r['baf']:>8.2f}")
            print(f"    低硫附加费 (LSF, 8%):          ${r['lsf']:>8.2f}")
            print(f"    港口拥堵费 (Congestion):       ${r['congestion_surcharge']:>8.2f}")
            print(f"    {'─' * 40}")
            print(f"    总费用 (Total):                ${r['total']:>8.2f}")
        except ValueError as e:
            print(f"\n  ❌ {label}: {e}")

    # 验证：上海 → 洛杉矶 40HQ
    print(f"\n{'=' * 56}")
    print("  ✅ 验证测试：上海(CNSHA) → 洛杉矶(USLAX), 40HQ")
    v = estimate_freight("CNSHA", "USLAX", "40HQ")
    # 预期: base = 1500 * 2.0 * 1.00 = 3000.0
    #       baf = 450.0, lsf = 240.0, congestion = 200.0
    #       total = 3890.0
    expected = {
        "base_freight": 3000.0,
        "baf": 450.0,
        "lsf": 240.0,
        "congestion_surcharge": 200.0,
        "total": 3890.0,
    }
    all_ok = True
    for k, exp in expected.items():
        got = v[k]
        ok = abs(got - exp) < 0.01
        status = "✅" if ok else "❌"
        print(f"    {status} {k:>22s}: 期望 {exp:>8.2f}, 实际 {got:>8.2f}")
        if not ok:
            all_ok = False
    print(f"\n  {'✅ 全部通过!' if all_ok else '❌ 有误差!'}")
