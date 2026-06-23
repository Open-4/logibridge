/**
 * authApi.ts — 认证相关 API
 */

import client from "./client";

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface UserPublic {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: UserPublic;
}

export async function registerApi(data: RegisterRequest): Promise<TokenResponse> {
  const res = await client.post("/api/auth/register", data);
  return res.data;
}

export async function loginApi(data: LoginRequest): Promise<TokenResponse> {
  const res = await client.post("/api/auth/login", data);
  return res.data;
}

export async function getMeApi(): Promise<UserPublic> {
  const res = await client.get("/api/auth/me");
  return res.data;
}

/** localStorage key */
const TOKEN_KEY = "logibridge_token";
const USER_KEY = "logibridge_user";

export function saveAuth(token: string, user: UserPublic) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): UserPublic | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  return !!getToken();
}
