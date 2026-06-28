import axios from "axios";
import { getToken, clearAuth } from "./authApi";

const client = axios.create({
  baseURL: "https://data-pipeline-sigma.vercel.app",
  timeout: 60_000,  // 60s 等待冷启动
  headers: { "Content-Type": "application/json" },
});

client.interceptors.request.use((config) => {
  const token = getToken();
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

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
