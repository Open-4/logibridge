/**
 * useControlTowerStore.ts — 控制塔全屏监控页状态管理
 */

import { create } from "zustand";
import {
  fetchShipments as apiFetchShipments,
  fetchRiskEvents as apiFetchRiskEvents,
  type ShipmentItem,
  type RiskGeoJson,
} from "../api/controlTowerApi";
import type { Position } from "../utils/tracking";

// ── 类型 ──────────────────────────────────────────────────────────────

export interface RiskEvent {
  id: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  radius_km: number;
  start_date: string;
  end_date: string;
  source: string;
  source_url?: string;
  coordinates: [number, number];
  affected_ports?: string[];
  affected_routes?: string[];
}

export interface Shipment extends ShipmentItem {
  // 扩展字段供本地使用
  coordinates?: [number, number];
}

// ── 港口代码 → 坐标映射 ────────────────────────────────────────────

const PORT_COORDS: Record<string, [number, number]> = {
  CNSHA: [121.47, 31.23],
  CNSGH: [121.48, 31.23],
  CNNGB: [121.88, 29.88],
  CNXMN: [118.07, 24.46],
  CNYTN: [114.27, 22.58],
  CNTAO: [120.3, 36.07],
  CNTSN: [117.72, 38.98],
  CNSHK: [113.92, 22.48],
  CNFOC: [119.46, 25.99],
  CNHAK: [110.3, 20.03],
  USLAX: [-118.24, 33.74],
  USLGB: [-118.19, 33.76],
  USNYC: [-74.01, 40.71],
  USSEA: [-122.33, 47.6],
  USSAV: [-81.15, 32.07],
  USMIA: [-80.19, 25.77],
  USHOU: [-95.28, 29.74],
  USBAL: [-76.58, 39.27],
  USPHL: [-75.14, 39.94],
  USCHS: [-79.93, 32.78],
  USNOR: [-76.3, 36.88],
  NLRTM: [4.5, 51.9],
  DEHAM: [9.99, 53.55],
  DEBRE: [8.8, 53.55],
  SGSIN: [103.85, 1.28],
  KRPUS: [129.05, 35.13],
  AEFJR: [55.37, 25.12],
  AEQWE: [55.05, 25.0],
  THLCH: [100.88, 13.07],
  AUSYD: [151.2, -33.85],
  AUMEL: [144.96, -37.82],
  CAVAN: [-123.12, 49.28],
  CAPRR: [-130.33, 54.3],
  JPYOK: [139.65, 35.45],
  TWTXG: [120.28, 22.62],
  VNHCM: [106.7, 10.77],
  COBAL: [-79.56, 8.95],
  PABLB: [-79.5, 8.95],
  PAMIT: [-79.5, 9.0],
  ZACPT: [18.42, -33.9],
  ZADUR: [31.02, -29.85],
  EGPSD: [32.35, 31.22],
  EGSUZ: [32.55, 29.97],
  HKHKG: [114.17, 22.32],
  MYPKG: [101.4, 3.0],
  MYTPP: [103.55, 1.37],
  NGTIN: [3.4, 6.45],
  KEMBA: [39.65, -4.05],
  IDJKT: [106.88, -6.13],
  PHMNL: [120.97, 14.55],
  NZAKL: [174.77, -36.85],
  MXVER: [-96.13, 19.2],
  BRSSZ: [-46.33, -23.93],
  BRRIO: [-43.18, -22.9],
  ARBUE: [-58.38, -34.6],
  CLVAP: [-71.62, -33.03],
  PEZLO: [-77.14, -12.05],
  TRISK: [28.97, 41.01],
  ESBCN: [2.17, 41.35],
  ITGIT: [8.93, 44.41],
  FRLEH: [0.1, 49.5],
  GBFXT: [1.35, 51.95],
  BEANR: [4.4, 51.22],
  INNSA: [72.85, 18.94],
  LKBJM: [79.85, 6.95],
  PKKHI: [67.0, 24.83],
  SADMM: [50.2, 26.5],
  SAJED: [39.17, 21.47],
  OMSOO: [56.75, 24.33],
};

export function getPortCoords(code: string): [number, number] {
  return PORT_COORDS[code] || [0, 0];
}

// ── Store ─────────────────────────────────────────────────────────────

interface ControlTowerState {
  riskEvents: RiskEvent[];
  shipments: Shipment[];
  selectedEvent: RiskEvent | null;
  selectedShipment: Shipment | null;
  affectedShipments: Shipment[];
  loading: boolean;
  panelHeight: number;

  fetchRiskEvents: () => Promise<void>;
  fetchShipments: () => Promise<void>;
  selectEvent: (event: RiskEvent | null) => void;
  selectShipment: (shipment: Shipment | null) => void;
  setPanelHeight: (height: number) => void;
  checkAffectedShipments: (event: RiskEvent) => void;
}

export const useControlTowerStore = create<ControlTowerState>(
  (set, get) => ({
    riskEvents: [],
    shipments: [],
    selectedEvent: null,
    selectedShipment: null,
    affectedShipments: [],
    loading: false,
    panelHeight: 200,

    fetchRiskEvents: async () => {
      try {
        const geo: RiskGeoJson = await apiFetchRiskEvents();
        const events: RiskEvent[] = geo.features.map((f) => ({
          id: f.properties.id,
          type: f.properties.type,
          severity: f.properties.severity,
          title: f.properties.title,
          description: f.properties.description,
          radius_km: f.properties.radius_km,
          start_date: f.properties.start_date,
          end_date: f.properties.end_date,
          source: f.properties.source,
          coordinates: f.geometry.coordinates as [number, number],
        }));
        set({ riskEvents: events });
      } catch {
        // 静默失败 — 地图可以无风险数据运行
      }
    },

    fetchShipments: async () => {
      set({ loading: true });
      try {
        const list = await apiFetchShipments();
        const withCoords: Shipment[] = list.map((s) => ({
          ...s,
          coordinates: getPortCoords(s.origin),
        }));
        set({ shipments: withCoords, loading: false });
      } catch {
        set({ loading: false });
      }
    },

    selectEvent: (event) => {
      set({ selectedEvent: event, selectedShipment: null });
      if (event) {
        get().checkAffectedShipments(event);
      } else {
        set({ affectedShipments: [] });
      }
    },

    selectShipment: (shipment) => {
      set({ selectedShipment: shipment, selectedEvent: null });
    },

    setPanelHeight: (height) => {
      set({ panelHeight: Math.min(500, Math.max(120, height)) });
    },

    checkAffectedShipments: (event) => {
      const { shipments } = get();
      const { affected_ports, affected_routes, radius_km, coordinates } =
        event as RiskEvent & {
          affected_ports?: string[];
          affected_routes?: string[];
        };

      const affected = shipments.filter((s) => {
        // 检查起运港/目的港是否在受影响港口列表中
        if (affected_ports?.includes(s.origin) || affected_ports?.includes(s.destination)) {
          return true;
        }
        // 检查航线是否受影响
        if (affected_routes?.some((r) => s.origin && s.destination)) {
          return true;
        }
        // 检查距离（粗略）
        if (coordinates && s.coordinates) {
          const [evtLon, evtLat] = coordinates;
          const [portLon, portLat] = s.coordinates;
          const dist = haversine(evtLat, evtLon, portLat, portLon);
          if (dist <= radius_km * 1.5) return true;
        }
        return false;
      });

      set({ affectedShipments: affected });
    },
  }),
);

// ── 工具函数 ──────────────────────────────────────────────────────────

function haversine(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
