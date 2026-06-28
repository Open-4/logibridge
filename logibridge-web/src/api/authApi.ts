/**
 * authApi.ts — 纯前端认证（localStorage）
 * 用于 Vercel 静态部署，无需后端 API
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
const USERS_KEY = "logibridge_users";  // 所有注册用户

/** 从 localStorage 读取用户列表 */
function getUsers(): Record<string, { email: string; password: string; name: string; id: string; createdAt: string }> {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveUsers(users: Record<string, any>) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export async function registerApi(data: RegisterRequest): Promise<TokenResponse> {
  const users = getUsers();
  
  if (users[data.email.toLowerCase()]) {
    throw { response: { status: 409, data: { detail: "该邮箱已被注册" } } };
  }
  
  if (data.password.length < 6) {
    throw { response: { status: 400, data: { detail: "密码长度不能少于 6 位" } } };
  }
  
  const id = Math.random().toString(36).slice(2, 14);
  const now = new Date().toISOString();
  
  users[data.email.toLowerCase()] = {
    id, email: data.email, password: data.password, name: data.name, createdAt: now
  };
  saveUsers(users);
  
  const user: UserPublic = { id, email: data.email, name: data.name, createdAt: now };
  const token = "tok_" + id;
  
  saveAuth(token, user);
  return { access_token: token, token_type: "bearer", user };
}

export async function loginApi(data: LoginRequest): Promise<TokenResponse> {
  const users = getUsers();
  const stored = users[data.email.toLowerCase()];
  
  if (!stored || stored.password !== data.password) {
    throw { response: { status: 401, data: { detail: "邮箱或密码错误" } } };
  }
  
  const user: UserPublic = { id: stored.id, email: stored.email, name: stored.name, createdAt: stored.createdAt };
  const token = "tok_" + stored.id;
  
  saveAuth(token, user);
  return { access_token: token, token_type: "bearer", user };
}

export async function getMeApi(): Promise<UserPublic> {
  const user = getStoredUser();
  if (!user) throw { response: { status: 401 } };
  return user;
}

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
