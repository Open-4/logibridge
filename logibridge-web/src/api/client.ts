/**
 * client.ts — Axios 实例 + 拦截器
 *
 * 请求拦截器：自动附带 Authorization: Bearer {token}
 * 响应拦截器：401 时自动清除认证信息并跳转到 /login
 */

import axios from "axios";
import { getToken, clearAuth } from "./authApi";

const client = axios.create({
  baseURL: "https://logibridge-api.znkfhyq.xyz",
  timeout: 30_000,
  headers: { "Content-Type": "application/json" },
});

// ── 请求拦截器：自动附带 token ─────────────────────────────────────────
client.interceptors.request.use((config) => {
  const token = getToken();
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── 响应拦截器：401 时清除登录状态 ─────────────────────────────────────
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearAuth();
      if (typeof window !== "undefined") {
        const path = window.location.pathname;
        if (path !== "/login" && path !== "/register") {
          window.location.href = "/login";
        }
      }
    }
    return Promise.reject(error);
  },
);

export default client;
