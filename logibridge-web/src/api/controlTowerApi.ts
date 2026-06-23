/**
 * controlTowerApi.ts — 控制塔相关 API 调用
 *
 * 公开接口:
 *   fetchRiskEvents()            GET /api/risk/events
 *   fetchShipments(params?)      GET /api/shipments
 *   fetchShipmentEvents(id)      GET /api/shipments/{id}/events
 *   fetchShipmentRisk(id)        GET /api/shipments/{id}/risk
 *   setShipmentAlert(id, rules)  POST /api/shipments/{id}/alert
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

export interface AlertRules {
  delayDays?: number;
  notifyOnException?: boolean;
  email?: string;
}

export interface AlertResponse {
  blNumber: string;
  alertSet: boolean;
  delayThresholdDays: number;
  message: string;
}

export interface FetchShipmentsParams {
  status?: string;
  search?: string;
}

/** 获取货物列表 */
export async function fetchShipments(
  params?: FetchShipmentsParams,
): Promise<ShipmentItem[]> {
  const query: Record<string, string> = {};
  if (params?.status) query.status = params.status;
  if (params?.search) query.search = params.search;
  const { data } = await client.get<ShipmentItem[]>("/api/shipments", {
    params: query,
  });
  return data;
}

/** 获取风险事件（GeoJSON 格式） */
export async function fetchRiskEvents(): Promise<RiskGeoJson> {
  const { data } = await client.get<RiskGeoJson>("/api/risk/events");
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

/** 检查货物受风险影响 */
export async function fetchShipmentRisk(
  blNumber: string,
): Promise<ShipmentRiskResponse> {
  const { data } = await client.get<ShipmentRiskResponse>(
    `/api/shipments/${blNumber}/risk`,
  );
  return data;
}

/** 设置预警规则 */
export async function setShipmentAlert(
  blNumber: string,
  rules: AlertRules,
): Promise<AlertResponse> {
  const params: Record<string, string | number> = {};
  if (rules.delayDays) params.delay_days = rules.delayDays;
  if (rules.notifyOnException) params.notify_exception = "true";
  const { data } = await client.post<AlertResponse>(
    `/api/shipments/${blNumber}/alert`,
    null,
    { params },
  );
  return data;
}
