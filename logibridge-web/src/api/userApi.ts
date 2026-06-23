/**
 * userApi.ts — 用户设置 & API Key 相关 API
 */

import client from "./client";

// ── 用户设置 ──────────────────────────────────────────────────────────

export interface UserSettings {
  language: string;
  currency: string;
  default_incoterm: string;
  notify_by_email: boolean;
  notify_by_sms: boolean;
  notify_on_delay: boolean;
  notify_on_risk: boolean;
}

export interface UserSettingsUpdate {
  language?: string;
  currency?: string;
  default_incoterm?: string;
  notify_by_email?: boolean;
  notify_by_sms?: boolean;
  notify_on_delay?: boolean;
  notify_on_risk?: boolean;
}

export async function getSettingsApi(): Promise<UserSettings> {
  const res = await client.get("/api/user/settings");
  return res.data;
}

export async function updateSettingsApi(
  data: UserSettingsUpdate,
): Promise<UserSettings> {
  const res = await client.put("/api/user/settings", data);
  return res.data;
}

// ── API Key ───────────────────────────────────────────────────────────

export interface ApiKey {
  id: string;
  userId: string;
  name: string;
  key: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export async function createApiKeyApi(name?: string): Promise<ApiKey> {
  const params = name ? { name } : {};
  const res = await client.post("/api/user/api-keys", null, { params });
  return res.data;
}

export async function listApiKeysApi(): Promise<ApiKey[]> {
  const res = await client.get("/api/user/api-keys");
  return res.data;
}

export async function deleteApiKeyApi(keyId: string): Promise<void> {
  await client.delete(`/api/user/api-keys/${keyId}`);
}
