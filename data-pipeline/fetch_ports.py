"""
fetch_ports.py — 从 UN/LOCODE 数据集下载并提取全球港口信息
"""

import pandas as pd
import json
import os
import re
import requests
import urllib3
import time
from io import StringIO

# 禁用 SSL 警告（Windows 环境证书链问题）
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# ---------- 1. 下载数据 ----------
URL = "https://raw.githubusercontent.com/datasets/un-locode/master/data/code-list.csv"
print(f"[1/5] 正在下载 UN/LOCODE CSV: {URL}")

for attempt in range(3):
    try:
        resp = requests.get(URL, timeout=30, verify=False)
        resp.raise_for_status()
        df = pd.read_csv(StringIO(resp.text))
        print(f"      下载完成，共 {len(df)} 行原始数据")
        break
    except Exception as e:
        if attempt < 2:
            wait = (attempt + 1) * 5
            print(f"      第 {attempt+1} 次尝试失败 ({e})，{wait}秒后重试…")
            time.sleep(wait)
        else:
            raise RuntimeError(f"下载失败（已重试 3 次）: {e}")

# ---------- 2. 选取所需列并重命名 ----------
print("[2/5] 选取列并重命名")
df = df[["Country", "Location", "Name", "Function", "Coordinates"]].copy()
print(f"      选取后共 {len(df)} 行")

# ---------- 3. 过滤 Function 包含 '1'（港口功能）的行 ----------
print("[3/5] 过滤 Function 包含 '1'（港口功能）的行")
df = df[df["Function"].astype(str).str.contains("1", na=False)].copy()
print(f"      过滤后共 {len(df)} 行（港口）")

# 删除 Coordinates 为空的行
before = len(df)
df = df.dropna(subset=["Coordinates"])
print(f"      删除 Coordinates 空值后共 {len(df)} 行（移除了 {before - len(df)} 行）")


# ---------- 4. 坐标解析函数 ----------
def parse_coordinates(coord_str: str):
    """
    将 UN/LOCODE 坐标格式解析为 (lat, lon) 小数度。
    输入格式如 "1234N 12345E" 或 "1234S 12345W"
    """
    if not isinstance(coord_str, str) or not coord_str.strip():
        return None, None

    parts = coord_str.strip().split()
    if len(parts) != 2:
        return None, None

    lat_str, lon_str = parts

    # 解析纬度：DDMM[D]
    lat_match = re.match(r"(\d{2,4})([NS])", lat_str)
    if not lat_match:
        return None, None
    lat_deg = int(lat_match.group(1)[:-2])  # 去掉最后两位（分钟）
    lat_min = int(lat_match.group(1)[-2:])  # 最后两位是分钟
    lat_dir = lat_match.group(2)
    lat = lat_deg + lat_min / 60.0
    if lat_dir == "S":
        lat = -lat

    # 解析经度：DDDMM[D]
    lon_match = re.match(r"(\d{3,5})([EW])", lon_str)
    if not lon_match:
        return None, None
    lon_deg = int(lon_match.group(1)[:-2])  # 去掉最后两位（分钟）
    lon_min = int(lon_match.group(1)[-2:])  # 最后两位是分钟
    lon_dir = lon_match.group(2)
    lon = lon_deg + lon_min / 60.0
    if lon_dir == "W":
        lon = -lon

    return round(lat, 6), round(lon, 6)


print("[4/5] 解析坐标并构建输出数据")
records = []
parse_errors = 0
for _, row in df.iterrows():
    lat, lon = parse_coordinates(row["Coordinates"])
    if lat is None or lon is None:
        parse_errors += 1
        continue

    records.append({
        "code": f"{row['Country']}{row['Location']}",
        "name": str(row["Name"]) if pd.notna(row["Name"]) else "",
        "country": row["Country"],
        "lat": lat,
        "lon": lon,
    })

print(f"      成功解析 {len(records)} 条，解析失败 {parse_errors} 条")

# ---------- 5. 导出为 JSON ----------
print("[5/5] 导出 JSON 到 output/ports.json")
os.makedirs("output", exist_ok=True)
output_path = os.path.join("output", "ports.json")
with open(output_path, "w", encoding="utf-8") as f:
    json.dump(records, f, ensure_ascii=False, indent=2)
print(f"      ✅ 已写入 {output_path}，共 {len(records)} 条港口数据")

# 打印前 5 条示例
print("\n📌 前 5 条数据示例：")
for r in records[:5]:
    print(f"   {r}")

print(f"\n🎉 完成！共导出 {len(records)} 个港口到 output/ports.json")
