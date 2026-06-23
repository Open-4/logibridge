/**
 * useConsultationNotifications.ts — 咨询新消息通知 Hook
 *
 * 通过 React Query 短轮询 GET /api/consultations 获取最新会话列表，
 * 与本地缓存对比，识别尚未读过的消息（基于 localStorage 存储的 lastSeen 时间戳）。
 *
 * 返回:
 *   unreadCount    — 未读消息总数
 *   unreadItems    — 最近的未读消息摘要列表（供下拉展示）
 *   markAsRead     — 将会话标记为已读
 *   markAllAsRead  — 全部标记已读
 */

import { useQuery } from "@tanstack/react-query";
import { fetchConsultations, type Consultation } from "../api/consultationApi";

const STORAGE_PREFIX = "logibridge_notify_";

// ── localStorage 工具 ──────────────────────────────────────────────

function getLastSeen(id: string): string {
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}${id}`) || "";
  } catch {
    return "";
  }
}

function setLastSeen(id: string, timestamp: string) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${id}`, timestamp);
  } catch {
    // 静默忽略
  }
}

/** 获取所有会话的最后一次已读时间戳 */
function getAllLastSeen(): Record<string, string> {
  const result: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) {
        result[key.slice(STORAGE_PREFIX.length)] = localStorage.getItem(key) || "";
      }
    }
  } catch {
    // 静默忽略
  }
  return result;
}

// ── 通知类型 ───────────────────────────────────────────────────────

export interface UnreadItem {
  consultationId: string;
  subject: string;
  lastMessage: string;
  lastMessageTime: string;
  category: string;
}

// ── Hook ───────────────────────────────────────────────────────────

export function useConsultationNotifications() {
  // 每 10 秒轮询一次
  const { data: consultations } = useQuery<Consultation[]>({
    queryKey: ["consultations", "notifications"],
    queryFn: fetchConsultations,
    refetchInterval: 10_000,
  });

  if (!consultations) {
    return { unreadCount: 0, unreadItems: [] as UnreadItem[], markAsRead: () => {}, markAllAsRead: () => {} };
  }

  const now = new Date().toISOString();
  const lastSeenMap = getAllLastSeen();

  const unreadItems: UnreadItem[] = [];

  for (const c of consultations) {
    if (c.status !== "active") continue;

    const lastMsg = c.messages?.[c.messages.length - 1];
    if (!lastMsg) continue;

    // 用户自己发送的消息不算未读
    if (lastMsg.senderType === "user") continue;

    const lastSeen = lastSeenMap[c.id] || "";
    if (lastMsg.createdAt > lastSeen) {
      unreadItems.push({
        consultationId: c.id,
        subject: c.subject,
        lastMessage: lastMsg.content.replace(/\*\*/g, "").slice(0, 60),
        lastMessageTime: lastMsg.createdAt,
        category: c.category,
      });
    }
  }

  // 按时间倒序
  unreadItems.sort((a, b) => (b.lastMessageTime > a.lastMessageTime ? 1 : -1));

  const markAsRead = (consultationId: string) => {
    const c = consultations.find((x) => x.id === consultationId);
    const lastMsg = c?.messages?.[c.messages.length - 1];
    if (lastMsg) setLastSeen(consultationId, lastMsg.createdAt);
  };

  const markAllAsRead = () => {
    for (const item of unreadItems) {
      const c = consultations.find((x) => x.id === item.consultationId);
      const lastMsg = c?.messages?.[c.messages.length - 1];
      if (lastMsg) setLastSeen(item.consultationId, lastMsg.createdAt);
    }
  };

  return {
    unreadCount: unreadItems.length,
    unreadItems: unreadItems.slice(0, 10), // 最多展示 10 条
    markAsRead,
    markAllAsRead,
  };
}
