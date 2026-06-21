/**
 * planApi.ts — 方案推演相关 API 调用
 */

import client from "./client";

export interface FreightEstimateResponse {
  base_freight: number;
  baf: number;
  lsf: number;
  congestion_surcharge: number;
  total: number;
}

export interface PortSearchItem {
  code: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
}

export interface HsCodeItem {
  code: string;
  description: string;
  section: string;
}

/**
 * 估算运费
 */
export async function estimateFreight(
  origin: string,
  destination: string,
  containerType: string,
): Promise<FreightEstimateResponse> {
  const { data } = await client.post<FreightEstimateResponse>(
    "/api/freight/estimate",
    { origin, destination, containerType },
  );
  return data;
}

/**
 * 港口搜索
 */
export async function searchPorts(
  q: string,
  limit = 15,
): Promise<PortSearchItem[]> {
  if (!q.trim()) return [];
  const { data } = await client.get<PortSearchItem[]>("/api/port/search", {
    params: { q, limit },
  });
  return data;
}

/**
 * HS 编码搜索
 */
export async function searchHsCodes(
  q: string,
  limit = 15,
): Promise<HsCodeItem[]> {
  if (!q.trim()) return [];
  const { data } = await client.get<HsCodeItem[]>("/api/hscode/search", {
    params: { q, limit },
  });
  return data;
}
