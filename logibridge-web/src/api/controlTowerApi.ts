/**
 * controlTowerApi.ts — 控制塔相关 API 调用
 */

import client from "./client";

export interface ShipmentItem {
  bl_number: string;
  origin: string;
  destination: string;
  cargo_desc: string;
  status: string;
  etd: string;
  eta: string;
}

export interface TrackingEventItem {
  eventType: string;
  location: string;
  timestamp: string | null;
  description: string | null;
}

export interface ShipmentEventsResponse {
  blNumber: string;
  events: TrackingEventItem[];
}

export interface RiskGeoJson {
  type: string;
  features: Array<{
    type: string;
    properties: {
      id: string;
      type: string;
      severity: string;
      title: string;
      description: string;
      radius_km: number;
      start_date: string;
      end_date: string;
      source: string;
    };
    geometry: { type: string; coordinates: [number, number] };
  }>;
}

export interface ShipmentRiskResponse {
  blNumber: string;
  riskLevel: string;
  risks: string[];
  activeRiskEvents: Array<{
    type: string;
    severity: string;
    title: string;
    description: string;
    radius_km: number;
  }>;
}

export interface AlertResponse {
  blNumber: string;
  alertSet: boolean;
  delayThresholdDays: number;
  message: string;
}

/** 获取货物列表 */
export async function fetchShipments(
  status?: string,
  search?: string,
): Promise<ShipmentItem[]> {
  const params: Record<string, string> = {};
  if (status) params.status = status;
  if (search) params.search = search;
  const { data } = await client.get<ShipmentItem[]>("/api/shipments", { params });
  return data;
}

/** 获取货物轨迹事件 */
export async function fetchShipmentEvents(
  blNumber: string,
): Promise<ShipmentEventsResponse> {
  const { data } = await client.get<ShipmentEventsResponse>(
    `/api/shipments/${blNumber}/events`,
  );
  return data;
}

/** 获取风险事件地图 GeoJSON */
export async function fetchRiskEventsGeoJson(): Promise<RiskGeoJson> {
  const { data } = await client.get<RiskGeoJson>("/api/risk/events");
  return data;
}

/** 检查货物受风险影响 */
export async function fetchShipmentRisk(
  blNumber: string,
): Promise<ShipmentRiskResponse> {
  const { data } = await client.get<ShipmentRiskResponse>(
    `/api/shipments/${blNumber}/risk`,
  );
  return data;
}

/** 设置预警 */
export async function setShipmentAlert(
  blNumber: string,
  delayDays: number,
): Promise<AlertResponse> {
  const { data } = await client.post<AlertResponse>(
    `/api/shipments/${blNumber}/alert`,
    null,
    { params: { delay_days: delayDays } },
  );
  return data;
}
