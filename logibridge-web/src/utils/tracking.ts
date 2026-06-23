/**
 * tracking.ts — 国际物流货物追踪数据模型
 *
 * 对应 TypeScript 接口定义（与后端 Python 模型同步）
 */

// ── 枚举 ──────────────────────────────────────────────────────────────

export enum ShipmentStatus {
  IN_TRANSIT = "in_transit",
  CUSTOMS_CLEARANCE = "customs_clearance",
  DELAYED = "delayed",
  DELIVERED = "delivered",
}

export enum TrackingEventType {
  DEPARTED_ORIGIN = "departed_origin",
  ARRIVED_TRANSIT = "arrived_transit",
  DEPARTED_TRANSIT = "departed_transit",
  ARRIVED_DESTINATION = "arrived_destination",
  CUSTOMS_HOLD = "customs_hold",
  OUT_FOR_DELIVERY = "out_for_delivery",
  DELIVERED = "delivered",
  EXCEPTION = "exception",
}

// ── 接口 ──────────────────────────────────────────────────────────────

export interface Position {
  lat: number;
  lon: number;
}

export interface Shipment {
  id: string;
  blNumber: string;
  origin: string;
  destination: string;
  cargoDesc: string;
  hsCode: string;
  status: ShipmentStatus;
  etd: string;
  eta: string;
  actualDeparture: string | null;
  actualArrival: string | null;
  vesselName?: string;
  imoNumber?: string;
  containerNumber?: string;
}

export interface TrackingEvent {
  id: string;
  shipmentId: string;
  eventType: TrackingEventType;
  location: string;
  locationName?: string;
  timestamp: string;
  description: string | null;
}

export interface VesselInfo {
  id: string;
  imoNumber: string;
  name: string;
  callSign: string;
  currentPosition: Position;
  currentSpeed: number;
  heading: number;
  lastUpdated: string;
}

// ── API 响应类型 ──────────────────────────────────────────────────────

export interface ShipmentTrackingResponse {
  shipment: Shipment;
  events: TrackingEvent[];
  vessel?: VesselInfo;
  riskLevel?: "low" | "medium" | "high" | "critical";
  risks?: string[];
}
