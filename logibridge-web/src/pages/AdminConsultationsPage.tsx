/**
 * AdminConsultationsPage.tsx — 顾问管理页面
 *
 * 路径: /admin/consultations
 *
 * 与 ConsultationPage 共享相同的消息界面，区别:
 *   1. 消息 senderType 固定为 "consultant"
 *   2. 顾问气泡颜色为紫色系 (#312E4B 背景 / #7C3AED 头像)
 *   3. 使用角色存储标识当前身份
 */

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Layout,
  Input,
  Button,
  Tag,
  Typography,
  Space,
  Avatar,
  Empty,
  Spin,
  message,
  Tooltip,
  Popover,
  Select,
  Modal,
  Badge,
  Radio,
} from "antd";
import {
  SendOutlined,
  CloseOutlined,
  SearchOutlined,
  RobotOutlined,
  UserOutlined,
  CustomerServiceOutlined,
  ShoppingCartOutlined,
  SwapOutlined,
  ReadOutlined,
  LeftOutlined,
  RightOutlined,
  ReloadOutlined,
  LoadingOutlined,
  MessageOutlined,
  LinkOutlined,
  PaperClipOutlined,
  ArrowLeftOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/zh-cn";
import {
  fetchConsultations,
  fetchConsultationMessages,
  sendMessage as apiSendMessage,
  closeConsultation,
  type Consultation,
  type Message,
  type QuoteItem,
} from "../api/consultationApi";
import MessageBubble from "../components/consultation/MessageBubble";
import { useRole } from "../store/useRoleStore";

dayjs.extend(relativeTime);
dayjs.locale("zh-cn");

const { Text, Title } = Typography;
const { TextArea } = Input;

const HEADER_HEIGHT = 56;

const STATUS_TAG_COLORS: Record<string, string> = {
  active: "green",
  closed: "default",
};

const STATUS_LABELS: Record<string, string> = {
  active: "进行中",
  closed: "已关闭",
};

// ═══════════════════════════════════════════════════════════════════════
//  会话卡片
// ═══════════════════════════════════════════════════════════════════════

interface SessionCardProps {
  consultation: Consultation;
  isActive: boolean;
  onClick: () => void;
}

const SessionCard: React.FC<SessionCardProps> = ({ consultation, isActive, onClick }) => {
  const lastMsg = consultation.messages?.[consultation.messages.length - 1];
  const previewText = lastMsg
    ? lastMsg.content.replace(/\*\*/g, "").slice(0, 50) + (lastMsg.content.length > 50 ? "..." : "")
    : "暂无消息";

  return (
    <div
      onClick={onClick}
      style={{
        padding: "12px 16px",
        cursor: "pointer",
        borderBottom: "1px solid #1E293B",
        background: isActive ? "rgba(124, 58, 237, 0.12)" : "transparent",
        borderLeft: isActive ? "3px solid #7C3AED" : "3px solid transparent",
        transition: "all 0.2s",
      }}
      onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "#1E293B"; }}
      onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <Avatar
          size={40}
          icon={<UserOutlined />}
          style={{ backgroundColor: "#334155", flexShrink: 0 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
            <Text strong ellipsis style={{ color: isActive ? "#A78BFA" : "#F1F5F9", fontSize: 14, flex: 1 }}>
              {consultation.subject}
            </Text>
            <Text style={{ color: "#64748B", fontSize: 11, flexShrink: 0, marginLeft: 8 }}>
              {dayjs(consultation.updatedAt).fromNow()}
            </Text>
          </div>
          <div style={{ marginBottom: 4 }}>
            {consultation.status === "closed" && (
              <Tag color="default" style={{ fontSize: 11, lineHeight: "18px", padding: "0 6px" }}>已关闭</Tag>
            )}
            <Tag color="geekblue" style={{ fontSize: 11, lineHeight: "18px", padding: "0 6px", marginLeft: 4 }}>
              #{consultation.category}
            </Tag>
          </div>
          <Text ellipsis style={{ color: "#64748B", fontSize: 12 }}>{previewText}</Text>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════
//  主页面
// ═══════════════════════════════════════════════════════════════════════

const AdminConsultationsPage: React.FC = () => {
  const navigate = useNavigate();
  const { isConsultant, toggleRole } = useRole();

  // ── 状态 ──────────────────────────────────────────────────────────
  const [sessions, setSessions] = useState<Consultation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeConsultation, setActiveConsultation] = useState<Consultation | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [searchText, setSearchText] = useState("");
  const [leftCollapsed, setLeftCollapsed] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── 加载会话列表 ──────────────────────────────────────────────────
  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchConsultations();
      setSessions(data);
    } catch (err) {
      console.error("加载会话列表失败:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  // ── 切换会话 ──────────────────────────────────────────────────────
  const switchSession = useCallback(async (id: string) => {
    setActiveId(id);
    try {
      const data = await fetchConsultationMessages(id);
      setActiveConsultation(data);
      loadSessions();
    } catch {
      message.error("加载会话详情失败");
    }
  }, [loadSessions]);

  // ── 发送消息 ──────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || !activeId || sending) return;

    setSending(true);
    setInputValue("");

    try {
      // 顾问回复 — senderType 固定为 consultant
      await apiSendMessage(activeId, {
        content: text,
        metadata: { senderType: "consultant" as const },
      });

      const updated = await fetchConsultationMessages(activeId);
      setActiveConsultation(updated);
      setSessions((prev) =>
        prev.map((s) => (s.id === activeId ? { ...s, updatedAt: updated.updatedAt } : s)),
      );
    } catch {
      message.error("发送失败，请重试");
    } finally {
      setSending(false);
      textAreaRef.current?.focus();
    }
  }, [inputValue, activeId, sending]);

  // ── 关闭会话 ──────────────────────────────────────────────────────
  const handleClose = useCallback(async () => {
    if (!activeId) return;
    try {
      const updated = await closeConsultation(activeId);
      setActiveConsultation(updated);
      loadSessions();
    } catch {
      message.error("关闭失败");
    }
  }, [activeId, loadSessions]);

  // ── 自动滚动 ──────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeConsultation?.messages]);

  // ── 键盘快捷键 ────────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  // ── 过滤 ──────────────────────────────────────────────────────────
  const filteredSessions = useMemo(() => {
    if (!searchText.trim()) return sessions;
    const q = searchText.toLowerCase();
    return sessions.filter((s) => {
      if (s.subject.toLowerCase().includes(q)) return true;
      const lastMsg = s.messages?.[s.messages.length - 1];
      if (lastMsg && lastMsg.content.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [sessions, searchText]);

  // ── 输入变化 ──────────────────────────────────────────────────────
  const onInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
  }, []);

  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  // ── 当前会话 ──────────────────────────────────────────────────────
  const currentSession = activeConsultation;

  return (
    <div
      style={{
        height: `calc(100vh - ${HEADER_HEIGHT}px)`,
        display: "flex",
        overflow: "hidden",
        background: "#0F172A",
      }}
    >
      {/* ══════════════════════════════════════════════════════════════
          左侧：会话列表
          ══════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {!leftCollapsed && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 320, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              width: 320,
              minWidth: 320,
              height: "100%",
              display: "flex",
              flexDirection: "column",
              borderRight: "1px solid #1E293B",
              background: "#0F172A",
              overflow: "hidden",
            }}
          >
            {/* 顶部：角色切换 + 返回按钮 */}
            <div
              style={{
                padding: "12px",
                borderBottom: "1px solid #1E293B",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Tooltip title="返回工作台">
                <Button
                  type="text"
                  icon={<ArrowLeftOutlined />}
                  onClick={() => navigate("/consultation")}
                  style={{ color: "#94A3B8" }}
                />
              </Tooltip>
              <Text strong style={{ color: "#F1F5F9", fontSize: 14, flex: 1 }}>
                顾问工作台
              </Text>
              <Tag
                color={isConsultant ? "purple" : "default"}
                style={{ cursor: "pointer", fontSize: 11, flexShrink: 0 }}
                onClick={toggleRole}
              >
                {isConsultant ? "顾问模式" : "用户模式"}
              </Tag>
            </div>

            {/* 搜索框 */}
            <div style={{ padding: "8px 12px" }}>
              <Input
                prefix={<SearchOutlined style={{ color: "#64748B" }} />}
                placeholder="搜索会话或消息..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                variant="borderless"
                style={{ background: "#1E293B", borderRadius: 8, color: "#F1F5F9", height: 36 }}
              />
            </div>

            {/* 会话列表 */}
            <div style={{ flex: 1, overflow: "auto" }}>
              {loading && sessions.length === 0 ? (
                <div style={{ textAlign: "center", padding: 40 }}>
                  <Spin indicator={<LoadingOutlined style={{ fontSize: 24, color: "#7C3AED" }} />} />
                </div>
              ) : filteredSessions.length === 0 ? (
                <div style={{ padding: 40 }}>
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={<Text style={{ color: "#64748B" }}>{searchText ? "未找到匹配的会话" : "暂无待处理的咨询"}</Text>}
                  />
                </div>
              ) : (
                filteredSessions.map((session) => (
                  <SessionCard
                    key={session.id}
                    consultation={session}
                    isActive={activeId === session.id}
                    onClick={() => switchSession(session.id)}
                  />
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 折叠按钮 */}
      <div
        onClick={() => setLeftCollapsed(!leftCollapsed)}
        style={{
          width: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          color: "#64748B",
          borderRight: "1px solid #1E293B",
          flexShrink: 0,
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#1E293B"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
      >
        {leftCollapsed ? <RightOutlined style={{ fontSize: 12 }} /> : <LeftOutlined style={{ fontSize: 12 }} />}
      </div>

      {/* ══════════════════════════════════════════════════════════════
          右侧：对话区
          ══════════════════════════════════════════════════════════════ */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", background: "#0F172A", minWidth: 0 }}>
        {currentSession ? (
          <>
            {/* 顶部栏 */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 20px",
                borderBottom: "1px solid #1E293B",
                flexShrink: 0,
                minHeight: 56,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Avatar size={32} icon={<UserOutlined />} style={{ backgroundColor: "#334155" }} />
                <div>
                  <Title level={5} style={{ margin: 0, color: "#F1F5F9", fontSize: 15 }}>
                    {currentSession.subject}
                  </Title>
                  <Text style={{ color: "#64748B", fontSize: 11 }}>
                    #{currentSession.category} · {currentSession.messages.length} 条消息
                  </Text>
                </div>
                <Tag color={STATUS_TAG_COLORS[currentSession.status]}>
                  {STATUS_LABELS[currentSession.status]}
                </Tag>
              </div>

              <Space size="small">
                <Tooltip title="刷新">
                  <Button type="text" icon={<ReloadOutlined />} onClick={() => switchSession(currentSession.id)} style={{ color: "#94A3B8" }} />
                </Tooltip>
                {currentSession.status === "active" && (
                  <Tooltip title="关闭咨询">
                    <Button type="text" icon={<CloseOutlined />} onClick={handleClose} style={{ color: "#EF4444" }} />
                  </Tooltip>
                )}
              </Space>
            </div>

            {/* 消息流 — 复用 MessageBubble */}
            <div style={{ flex: 1, overflow: "auto", padding: "16px 20px" }}>
              {currentSession.messages.length === 0 ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12 }}>
                  <CustomerServiceOutlined style={{ fontSize: 48, color: "#334155" }} />
                  <Text style={{ color: "#64748B", fontSize: 15 }}>选择一个咨询会话进行回复</Text>
                </div>
              ) : (
                currentSession.messages.map((msg, idx) => (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    isLast={idx === currentSession.messages.length - 1}
                  />
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* 底部输入区 */}
            <div
              style={{
                borderTop: "1px solid #1E293B",
                padding: "12px 20px 16px",
                flexShrink: 0,
                background: "#0F172A",
              }}
            >
              <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                <TextArea
                  ref={textAreaRef as React.Ref<any>}
                  value={inputValue}
                  onChange={onInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="输入顾问回复，Enter 发送，Shift+Enter 换行..."
                  autoSize={{ minRows: 1, maxRows: 4 }}
                  variant="borderless"
                  style={{
                    flex: 1,
                    background: "#1E293B",
                    color: "#F1F5F9",
                    borderRadius: 10,
                    padding: "10px 14px",
                    fontSize: 14,
                    resize: "none",
                  }}
                />
                <Button
                  type="primary"
                  icon={sending ? <LoadingOutlined /> : <SendOutlined />}
                  onClick={handleSend}
                  disabled={!inputValue.trim() || sending}
                  style={{
                    height: 40,
                    width: 40,
                    borderRadius: 10,
                    flexShrink: 0,
                    background: "#7C3AED",
                    borderColor: "#7C3AED",
                  }}
                />
              </div>
            </div>
          </>
        ) : (
          /* 未选中会话 */
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 16 }}>
            <CustomerServiceOutlined style={{ fontSize: 56, color: "#334155" }} />
            <Title level={4} style={{ color: "#64748B", margin: 0, fontWeight: 400 }}>顾问工作台</Title>
            <Text style={{ color: "#475569", maxWidth: 420, textAlign: "center" }}>
              从左侧选择用户发起的咨询会话，在此回复用户消息。
              您的回复将以人工顾问身份发送。
            </Text>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminConsultationsPage;
