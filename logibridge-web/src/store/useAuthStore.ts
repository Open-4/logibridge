/**
 * useAuthStore.ts — 认证状态管理（Zustand）
 *
 * - state: user / token / loading
 * - actions: login / register / logout / fetchUser
 * - 初始化时从 localStorage 读取 token，自动调用 fetchUser 验证
 */

import { create } from "zustand";
import type { UserPublic } from "../api/authApi";
import {
  loginApi,
  registerApi,
  getMeApi,
  saveAuth,
  clearAuth,
  getToken,
  getStoredUser,
} from "../api/authApi";

interface AuthState {
  user: UserPublic | null;
  token: string | null;
  loading: boolean; // 初始化 / 请求中

  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  fetchUser: () => Promise<void>;
  /** 应用启动时从 localStorage 恢复状态并验证 */
  init: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  loading: true, // 初始化时先为 true，init() 完成后设为 false

  // ── 登录 ───────────────────────────────────────────────────────────
  login: async (email, password) => {
    const res = await loginApi({ email, password });
    saveAuth(res.access_token, res.user);
    set({ user: res.user, token: res.access_token });
  },

  // ── 注册 ───────────────────────────────────────────────────────────
  register: async (email, password, name) => {
    const res = await registerApi({ email, password, name });
    saveAuth(res.access_token, res.user);
    set({ user: res.user, token: res.access_token });
  },

  // ── 登出 ───────────────────────────────────────────────────────────
  logout: () => {
    clearAuth();
    set({ user: null, token: null });
  },

  // ── 通过 /api/auth/me 验证 token 有效性 ────────────────────────────
  fetchUser: async () => {
    try {
      const user = await getMeApi();
      set({ user, loading: false });
    } catch {
      // token 无效或过期，清除
      clearAuth();
      set({ user: null, token: null, loading: false });
    }
  },

  // ── 初始化 ─────────────────────────────────────────────────────────
  init: async () => {
    const token = getToken();
    if (!token) {
      set({ loading: false });
      return;
    }

    set({ token });

    // 先从 localStorage 拿出缓存的 user 展示，避免白屏
    const cached = getStoredUser();
    if (cached) {
      set({ user: cached });
    }

    // 再异步验证
    await get().fetchUser();
  },
}));
