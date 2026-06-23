/**
 * consultationApi.ts — 咨询 / 知识库 API 调用
 *
 * 公开接口:
 *   fetchConsultations()          GET /api/consultations
 *   fetchConsultationMessages(id) GET /api/consultations/{id}
 *   sendMessage(id, data)         POST /api/consultations/{id}/messages
 *   createConsultation(data)      POST /api/consultations
 *   fetchContext(id)              GET /api/consultations/{id}/context
 *   closeConsultation(id)         POST /api/consultations/{id}/close
 *   searchKnowledge(q)            GET /api/knowledge/search?q=
 */

import client from "./client";

// ── 类型定义 ──────────────────────────────────────────────────────────

export interface Attachment {
  name?: string;
  url?: string;
  type?: string;
  [key: string]: unknown;
}

export interface Message {
  id: string;
  consultationId: string;
  senderType: "user" | "ai" | "system" | "consultant";
  content: string;
  attachments: Attachment[];
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface Consultation {
  id: string;
  userId: string;
  subject: string;
  category: string;
  status: "active" | "closed";
  createdAt: string;
  updatedAt: string;
  messages: Message[];
}

export interface CreateConsultationRequest {
  subject: string;
  category: string;
  initialMessage?: string;
}

export interface SendMessageRequest {
  content: string;
  attachments?: Attachment[];
  metadata?: Record<string, unknown>;
}

export interface KnowledgeArticle {
  id: string;
  title: string;
  content: string;
  tags: string[];
}

export interface ReferencedShipment {
  blNumber: string;
  cargoDesc: string;
  origin: string;
  destination: string;
  status: string;
}

export interface ConsultationContext {
  consultationId: string;
  subject: string;
  category: string;
  referencedShipments: ReferencedShipment[];
  referencedSolutions: unknown[];
  complianceSnapshots: unknown[];
}

// ── 引用类型 ──────────────────────────────────────────────────────────

export interface QuoteItem {
  type: "shipment" | "plan";
  id: string;
  label: string;
  sublabel?: string;
}

// ── API 函数 ──────────────────────────────────────────────────────────

/** GET /api/consultations — 获取当前用户的所有咨询会话列表 */
export async function fetchConsultations(): Promise<Consultation[]> {
  const { data } = await client.get<Consultation[]>("/api/consultations");
  return data;
}

/** GET /api/consultations/{id} — 获取咨询详情（含所有消息） */
export async function fetchConsultationMessages(
  id: string,
): Promise<Consultation> {
  const { data } = await client.get<Consultation>(`/api/consultations/${id}`);
  return data;
}

/** POST /api/consultations/{id}/messages — 发送消息 */
export async function sendMessage(
  consultationId: string,
  req: SendMessageRequest,
): Promise<Message> {
  const { data } = await client.post<Message>(
    `/api/consultations/${consultationId}/messages`,
    req,
  );
  return data;
}

/** POST /api/consultations — 创建咨询会话 */
export async function createConsultation(
  req: CreateConsultationRequest,
): Promise<Consultation> {
  const { data } = await client.post<Consultation>("/api/consultations", req);
  return data;
}

/** GET /api/consultations/{id}/context — 获取 AI 上下文快照 */
export async function fetchContext(
  consultationId: string,
): Promise<ConsultationContext> {
  const { data } = await client.get<ConsultationContext>(
    `/api/consultations/${consultationId}/context`,
  );
  return data;
}

/** POST /api/consultations/{id}/close — 关闭咨询会话 */
export async function closeConsultation(
  consultationId: string,
): Promise<Consultation> {
  const { data } = await client.post<Consultation>(
    `/api/consultations/${consultationId}/close`,
  );
  return data;
}

/** GET /api/knowledge/search?q= — 搜索知识库文章 */
export async function searchKnowledge(
  q: string,
): Promise<KnowledgeArticle[]> {
  const { data } = await client.get<KnowledgeArticle[]>("/api/knowledge/search", {
    params: { q },
  });
  return data;
}
