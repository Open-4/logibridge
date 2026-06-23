/**
 * useConsultationStore.ts — 智能咨询工作台的全局状态
 *
 * state:
 *   consultations        — 会话列表
 *   currentConsultationId — 当前选中的会话 ID
 *   messages             — 当前会话的消息列表
 *   context              — 当前会话的上下文快照
 *   loading              — 加载中
 *   sidebarOpen          — 右侧上下文面板是否展开
 *
 * actions:
 *   fetchConsultations   — 从后端加载会话列表
 *   selectConsultation   — 切换会话并加载消息 & 上下文
 *   sendMessage          — 发送消息并等待 AI 回复
 *   uploadFile           — 上传文件（MVP 阶段占位）
 *   fetchContext         — 获取当前会话的上下文快照
 *   toggleSidebar        — 切换右侧面板
 *   closeConsultation    — 关闭当前会话
 */

import { create } from "zustand";
import {
  fetchConsultations as apiFetchConsultations,
  fetchConsultationMessages,
  sendMessage as apiSendMessage,
  fetchContext as apiFetchContext,
  closeConsultation as apiCloseConsultation,
} from "../api/consultationApi";
import type {
  Consultation,
  Message,
  ConsultationContext,
  SendMessageRequest,
} from "../api/consultationApi";

// ── Store 类型 ──────────────────────────────────────────────────────

interface ConsultationState {
  // ── state ────────────────────────────────────────────────────
  consultations: Consultation[];
  currentConsultationId: string | null;
  messages: Message[];
  context: ConsultationContext | null;
  loading: boolean;
  sidebarOpen: boolean;

  // ── actions ──────────────────────────────────────────────────
  fetchConsultations: () => Promise<void>;
  selectConsultation: (id: string) => Promise<void>;
  sendMessage: (req: SendMessageRequest) => Promise<Message | null>;
  uploadFile: (file: File) => Promise<string | null>;
  fetchContext: () => Promise<void>;
  toggleSidebar: () => void;
  closeConsultation: () => Promise<void>;
}

// ── Store 实现 ──────────────────────────────────────────────────────

export const useConsultationStore = create<ConsultationState>(
  (set, get) => ({
    // ── 初始 state ───────────────────────────────────────────────
    consultations: [],
    currentConsultationId: null,
    messages: [],
    context: null,
    loading: false,
    sidebarOpen: false,

    // ── 加载会话列表 ────────────────────────────────────────────
    fetchConsultations: async () => {
      set({ loading: true });
      try {
        const consultations = await apiFetchConsultations();
        set({ consultations, loading: false });
      } catch (err) {
        console.error("[useConsultationStore] fetchConsultations failed:", err);
        set({ loading: false });
      }
    },

    // ── 切换会话（加载消息 + 上下文） ───────────────────────────
    selectConsultation: async (id: string) => {
      const currentId = get().currentConsultationId;
      if (currentId === id) return; // 已选中，跳过

      set({ currentConsultationId: id, loading: true, sidebarOpen: false });

      try {
        // 并行加载消息和上下文
        const [detail, ctx] = await Promise.all([
          fetchConsultationMessages(id),
          apiFetchContext(id).catch(() => null),
        ]);
        set({
          messages: detail.messages ?? [],
          context: ctx,
          loading: false,
        });
      } catch (err) {
        console.error(
          "[useConsultationStore] selectConsultation failed:",
          err,
        );
        set({ loading: false });
      }
    },

    // ── 发送消息 ────────────────────────────────────────────────
    sendMessage: async (req: SendMessageRequest) => {
      const id = get().currentConsultationId;
      if (!id) return null;

      try {
        // 发送用户消息
        const created = await apiSendMessage(id, req);

        // 立即将用户消息添加到本地列表（保持 UI 响应）
        const userMsg: Message = {
          id: created.id,
          consultationId: created.consultationId,
          senderType: "user",
          content: req.content,
          attachments: req.attachments ?? [],
          metadata: req.metadata ?? {},
          createdAt: created.createdAt,
        };
        set((s) => ({ messages: [...s.messages, userMsg] }));

        // 重新加载完整会话以获取 AI 回复
        const detail = await fetchConsultationMessages(id);
        set({ messages: detail.messages ?? [] });

        return created;
      } catch (err) {
        console.error("[useConsultationStore] sendMessage failed:", err);
        throw err;
      }
    },

    // ── 上传文件（MVP 阶段占位） ────────────────────────────────
    uploadFile: async (_file: File) => {
      // MVP 阶段仅返回占位 URL，后续接入真实上传
      console.warn("[useConsultationStore] uploadFile: MVP stub");
      return null;
    },

    // ── 获取当前会话的上下文快照 ────────────────────────────────
    fetchContext: async () => {
      const id = get().currentConsultationId;
      if (!id) return;

      try {
        const context = await apiFetchContext(id);
        set({ context });
      } catch (err) {
        console.error("[useConsultationStore] fetchContext failed:", err);
      }
    },

    // ── 切换右侧面板 ────────────────────────────────────────────
    toggleSidebar: () => {
      set((s) => ({ sidebarOpen: !s.sidebarOpen }));
    },

    // ── 关闭当前会话 ────────────────────────────────────────────
    closeConsultation: async () => {
      const id = get().currentConsultationId;
      if (!id) return;

      try {
        const updated = await apiCloseConsultation(id);

        // 更新本地列表中的状态
        set((s) => ({
          consultations: s.consultations.map((c) =>
            c.id === id
              ? { ...c, status: "closed", updatedAt: updated.updatedAt }
              : c,
          ),
          // 如果当前会话被关闭，更新其消息列表（含系统提示）
          messages: updated.messages ?? s.messages,
        }));
      } catch (err) {
        console.error(
          "[useConsultationStore] closeConsultation failed:",
          err,
        );
        throw err;
      }
    },
  }),
);
