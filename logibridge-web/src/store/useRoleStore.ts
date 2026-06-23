/**
 * useRoleStore.ts — 角色选择状态（用户/顾问）
 *
 * 存储在 localStorage 中，持久化。
 *
 * 角色值:
 *   "user"       — 普通用户（默认）
 *   "consultant" — 人工顾问
 */

import { useState, useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "logibridge_role";

function getStoredRole(): "user" | "consultant" {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "consultant") return "consultant";
  } catch {
    // localStorage 不可用时静默回退
  }
  return "user";
}

function storeRole(role: "user" | "consultant") {
  try {
    localStorage.setItem(STORAGE_KEY, role);
  } catch {
    // 静默忽略
  }
}

// ── 全局订阅（确保多标签页同步） ──────────────────────────────────

const listeners = new Set<() => void>();

function subscribeToRoleStore(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function snapshotRole(): "user" | "consultant" {
  return getStoredRole();
}

function emitChange() {
  for (const cb of listeners) cb();
}

// ── Hook ──────────────────────────────────────────────────────────

export function useRole() {
  const role = useSyncExternalStore(subscribeToRoleStore, snapshotRole);

  const setRole = useCallback((newRole: "user" | "consultant") => {
    storeRole(newRole);
    emitChange();
  }, []);

  const toggleRole = useCallback(() => {
    const next = getStoredRole() === "user" ? "consultant" : "user";
    storeRole(next);
    emitChange();
  }, []);

  const isConsultant = role === "consultant";

  return { role, setRole, toggleRole, isConsultant } as const;
}
