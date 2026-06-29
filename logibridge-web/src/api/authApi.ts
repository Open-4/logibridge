/**
 * authApi.ts — 真实后端认证 API 调用
 *
 * 通过 /api/auth/* 端点与 FastAPI 后端通信，使用 JWT 令牌。
 * Token 和 user 信息缓存在 localStorage 中以保持登录状态。
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

/** localStorage keys */
const TOKEN_KEY = "logibridge_token";
const USER_KEY = "logibridge_user";

// ── 持久化 ────────────────────────────────────────────────────────

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

// ── API 调用 ──────────────────────────────────────────────────────

/** POST /api/auth/register — 注册新用户 */
export async function registerApi(data: RegisterRequest): Promise<TokenResponse> {
  const { data: res } = await client.post<TokenResponse>("/api/auth/register", {
    email: data.email.toLowerCase().trim(),
    password: data.password,
    name: data.name.trim(),
  });
  return res;
}

/** POST /api/auth/login — 登录 */
export async function loginApi(data: LoginRequest): Promise<TokenResponse> {
  const { data: res } = await client.post<TokenResponse>("/api/auth/login", {
    email: data.email.toLowerCase().trim(),
    password: data.password,
  });
  return res;
}

/** GET /api/auth/me — 获取当前用户信息（验证 token） */
export async function getMeApi(): Promise<UserPublic> {
  const { data } = await client.get<UserPublic>("/api/auth/me");
  return data;
}
