/**
 * GlobeRouteMap.tsx
 *
 * 3D 全球航线地图组件 — 基于 MapLibre GL + react-map-gl + Deck.gl
 *
 * Props:
 *   origin, destination — 起终点（含名称与坐标 [lng, lat]）
 *   via?                — 途经港列表（可选分段弧线）
 *   color               — 航线颜色 RGB 数组 [R, G, B]，默认 (59,130,246)
 *
 * 依赖:
 *   maplibre-gl | react-map-gl@7.1.7 | @deck.gl/core | @deck.gl/layers | @deck.gl/react
 *   环境变量 VITE_MAPTILER_KEY（已配在 .env 中）
 */

import { useMemo } from "react";
import { Map as MapLibreMap } from "react-map-gl/maplibre";
import DeckGL from "@deck.gl/react";
import { ArcLayer, ScatterplotLayer } from "@deck.gl/layers";
import type { Port, GlobeRouteMapProps } from "./types";
import "maplibre-gl/dist/maplibre-gl.css";

// ── 常量 ──────────────────────────────────────────────────────────────

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY as string;

/** 免费地图风格：MapTiler（需密钥）→ MapLibre 官方 DEMO 瓦片（免密钥、永远有效） */
const MAP_STYLE = MAPTILER_KEY
  ? `https://api.maptiler.com/maps/streets-v2-dark/tiles.json?key=${MAPTILER_KEY}`
  : "https://demotiles.maplibre.org/style.json";

// ── 工具函数 ──────────────────────────────────────────────────────────

/**
 * 根据起终点计算初始视图（两者居中位置，2.5 倍缩放，45° 俯角）
 */
function computeViewState(
  origin: Port,
  destination: Port,
): {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
} {
  const [ox, oy] = origin.coordinates;
  const [dx, dy] = destination.coordinates;

  return {
    longitude: (ox + dx) / 2,
    latitude: (oy + dy) / 2,
    zoom: 2.5,
    pitch: 45,
    bearing: 0,
  };
}

/**
 * 将 0‑255 RGB 归一化为 0‑1 float 数组
 */
function normalizeColor(rgb: [number, number, number]): [number, number, number] {
  return [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255];
}

// ── 组件 ──────────────────────────────────────────────────────────────

const GlobeRouteMap: React.FC<GlobeRouteMapProps> = ({
  origin,
  destination,
  via,
  color = [59, 130, 246],
}) => {
  const initialViewState = useMemo(
    () => computeViewState(origin, destination),
    [origin, destination],
  );

  // 拼接所有航段（origin → via1 → via2 → ... → destination）
  const segments = useMemo(() => {
    const points: Port[] = [origin, ...(via ?? []), destination];
    const segs: Array<{ from: Port; to: Port }> = [];
    for (let i = 0; i < points.length - 1; i++) {
      segs.push({ from: points[i], to: points[i + 1] });
    }
    return segs;
  }, [origin, destination, via]);

  // Deck.gl 图层
  const layers = useMemo(() => {
    const [r, g, b] = normalizeColor(color);

    const allPorts: Port[] = [origin, ...(via ?? []), destination];

    // 港口散点层
    const scatterLayer = new ScatterplotLayer<Port>({
      id: "ports",
      data: allPorts,
      getPosition: (d: Port) => d.coordinates,
      getFillColor: [r * 255, g * 255, b * 255, 200],
      getRadius: 60_000, // 60 km
      radiusMinPixels: 4,
      radiusMaxPixels: 12,
      pickable: true,
      stroked: true,
      getLineColor: [255, 255, 255, 180],
      lineWidthMinPixels: 1.5,
    });

    // 航线弧线层
    const arcLayer = new ArcLayer<{ from: Port; to: Port }>({
      id: "routes",
      data: segments,
      getSourcePosition: (d) => d.from.coordinates,
      getTargetPosition: (d) => d.to.coordinates,
      getSourceColor: [r * 255, g * 255, b * 255, 180],
      getTargetColor: [r * 255, g * 255, b * 255, 100],
      getWidth: 2,
      widthMinPixels: 1.5,
      widthMaxPixels: 5,
      pickable: true,
    });

    return [scatterLayer, arcLayer];
  }, [origin, destination, via, color, segments]);

  return (
    <DeckGL
      layers={layers}
      initialViewState={initialViewState}
      controller={true}
      pickingRadius={5}
    >
      <MapLibreMap
        mapStyle={MAP_STYLE}
        attributionControl={true}
        style={{ width: "100%", height: "100%" }}
      />
    </DeckGL>
  );
};

export default GlobeRouteMap;
