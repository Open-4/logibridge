/**
 * GlobeRouteMap 共享类型
 */

export interface Port {
  name: string;
  coordinates: [number, number]; // [lng, lat]
}

export interface GlobeRouteMapProps {
  /** 起运港 */
  origin: Port;
  /** 目的港 */
  destination: Port;
  /** 途经港（可选） */
  via?: Port[];
  /** 航线颜色 RGB 0‑255，默认 (59,130,246) 蓝色 */
  color?: [number, number, number];
}
