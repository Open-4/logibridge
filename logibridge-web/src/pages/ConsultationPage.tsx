/**
 * ConsultationPage.tsx — 智能咨询工作台
 *
 * 布局: calc(100vh - 56px)，左右两栏 + 右侧可收起边栏
 *
 * 左侧 (320px)   : 会话搜索 & 列表 & 新建按钮
 * 右侧 (剩余宽度)  : 对话消息流 + 底部输入区
 * 右侧边栏 (280px): 上下文信息面板（默认收起）
 */

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Layout,
  List,
  Input,
  Button,
  Tag,
  Typography,
  Space,
  Avatar,
  Badge,
  Empty,
  Spin,
  message,
  Tooltip,
  Popover,
  Upload,
  Modal,
  Card,
  Divider,
  Select,
  Form,
} from "antd";
import type { ListProps } from "antd/es/list";
import {
  PlusOutlined,
  SendOutlined,
  CloseOutlined,
  SearchOutlined,
  FileOutlined,
  PaperClipOutlined,
  RobotOutlined,
  UserOutlined,
  CustomerServiceOutlined,
  ShoppingCartOutlined,
  SafetyOutlined,
  ReadOutlined,
  RightOutlined,
  LeftOutlined,
  ReloadOutlined,
  EllipsisOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  LoadingOutlined,
  FolderOpenOutlined,
  InboxOutlined,
  MessageOutlined,
  SwapOutlined,
  LinkOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/zh-cn";
import {
  createConsultation,
  fetchConsultations,
  fetchConsultationMessages,
  sendMessage,
  fetchContext,
  searchKnowledge,
  closeConsultation,
  type Consultation,
  type Message,
  type KnowledgeArticle,
  type ConsultationContext,
  type CreateConsultationRequest,
  type QuoteItem,
} from "../api/consultationApi";
import { fetchShipments } from "../api/controlTowerApi";
import type { ShipmentItem } from "../api/controlTowerApi";

dayjs.extend(relativeTime);
dayjs.locale("zh-cn");

const { Text, Title, Paragraph } = Typography;
const { TextArea } = Input;

// ═══════════════════════════════════════════════════════════════════════
//  辅助常量 / 类型
// ═══════════════════════════════════════════════════════════════════════

const SIDEBAR_WIDTH = 280;
const LIST_WIDTH = 320;
const COLLAPSED_LIST_WIDTH = 0;
const HEADER_HEIGHT = 56;

const CATEGORY_TAG_COLORS: Record<string, string> = {
  compliance: "orange",
  freight: "blue",
  customs: "purple",
};

const CATEGORY_LABELS: Record<string, string> = {
  compliance: "合规",
  freight: "运费",
  customs: "报关",
};

const STATUS_TAG_COLORS: Record<string, string> = {
  active: "green",
  closed: "default",
};

const STATUS_LABELS: Record<string, string> = {
  active: "进行中",
  closed: "已关闭",
};

// ═══════════════════════════════════════════════════════════════════════
//  消息气泡组件
// ═══════════════════════════════════════════════════════════════════════

interface MessageBubbleProps {
  message: Message;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const navigate = useNavigate();
  const isUser = message.senderType === "user";
  const isAI = message.senderType === "ai";
  const isSystem = message.senderType === "system";

  // 解析内容中的 Markdown 风格文本（粗体、列表）
  const renderContent = (text: string) => {
    // 简单的行解析
    const lines = text.split("\n");
    return lines.map((line, i) => {
      // 粗体 **text**
      const parts = line.split(/(\*\*.*?\*\*)/g);
      const elements = parts.map((part, j) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <Text key={j} strong style={{ color: "#F1F5F9" }}>
              {part.slice(2, -2)}
            </Text>
          );
        }
        // 无序列表项
        if (part.startsWith("  • ")) {
          return (
            <Text key={j} style={{ color: "#CBD5E1" }}>
              {part}
            </Text>
          );
        }
        // 带 emoji 的列表项
        if (part.startsWith("    - ")) {
          return (
            <Text key={j} style={{ color: "#94A3B8", fontSize: 13 }}>
              {part}
            </Text>
          );
        }
        return (
          <Text key={j} style={{ color: isUser ? "#FFFFFF" : "#CBD5E1", whiteSpace: "pre-wrap" }}>
            {part}
          </Text>
        );
      });

      // 有序列表数字
      const numberedMatch = line.match(/^(\d+\.\s)(.*)/);
      if (numberedMatch) {
        return (
          <div key={i} style={{ display: "flex", gap: 4 }}>
            <Text style={{ color: isUser ? "#BFDBFE" : "#60A5FA" }}>{numberedMatch[1]}</Text>
            <span>{numberedMatch[2]}</span>
          </div>
        );
      }

      return (
        <div key={i} style={{ minHeight: 20 }}>
          {elements}
          {i < lines.length - 1 && <br />}
        </div>
      );
    });
  };

  // 系统消息居中显示
  if (isSystem) {
    return (
      <div style={{ textAlign: "center", margin: "12px 0" }}>
        <Tag color="default" style={{ fontSize: 12, opacity: 0.7 }}>
          {message.content}
        </Tag>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        marginBottom: 16,
        flexDirection: isUser ? "row-reverse" : "row",
        paddingRight: isUser ? 0 : 40,
        paddingLeft: isUser ? 40 : 0,
      }}
    >
      {/* 头像 */}
      {isUser ? (
        <Avatar
          size={36}
          icon={<UserOutlined />}
          style={{
            backgroundColor: "#3B82F6",
            flexShrink: 0,
            marginTop: 4,
          }}
        />
      ) : isAI ? (
        <Avatar
          size={36}
          icon={<RobotOutlined />}
          style={{
            backgroundColor: "#1A365D",
            border: "1px solid #3B82F6",
            flexShrink: 0,
            marginTop: 4,
          }}
        />
      ) : (
        <Avatar
          size={36}
          icon={<CustomerServiceOutlined />}
          style={{
            backgroundColor: "#334155",
            flexShrink: 0,
            marginTop: 4,
          }}
        />
      )}

      {/* 气泡内容 */}
      <div
        style={{
          maxWidth: "75%",
          minWidth: 60,
        }}
      >
        {/* 发送者标签 */}
        <div
          style={{
            fontSize: 12,
            color: "#64748B",
            marginBottom: 4,
            textAlign: isUser ? "right" : "left",
          }}
        >
          {isUser ? "我" : isAI ? "AI 顾问" : "系统"}
          <span style={{ marginLeft: 8 }}>
            {dayjs(message.createdAt).format("HH:mm")}
          </span>
        </div>

        {/* 气泡主体 */}
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            borderBottomRightRadius: isUser ? 4 : 12,
            borderBottomLeftRadius: isUser ? 12 : 4,
            background: isUser
              ? "#3B82F6"
              : isAI
                ? "#1A365D"
                : "#1E293B",
            border: isAI ? "1px solid #2563EB33" : "none",
            lineHeight: 1.6,
            fontSize: 14,
          }}
        >
          {renderContent(message.content)}
        </div>

        {/* 附件 */}
        {message.attachments.length > 0 && (
          <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {message.attachments.map((att, idx) => (
              <Tag
                key={idx}
                icon={<FileOutlined />}
                color="geekblue"
                style={{ cursor: "pointer", margin: 0 }}
                onClick={() => {
                  if (att.url) window.open(att.url, "_blank");
                }}
              >
                {att.name || `附件 ${idx + 1}`}
              </Tag>
            ))}
          </div>
        )}

        {/* 引用块（metadata.quote 格式） */}
        {message.metadata?.quote && Array.isArray(message.metadata.quote) && (
          <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {(message.metadata.quote as Array<{ type: string; id: string; label: string }>).map((q, idx) => {
              const isShipment = q.type === "shipment";
              return (
                <span
                  key={`${q.type}-${q.id}-${idx}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "4px 10px",
                    background: isShipment ? "rgba(59, 130, 246, 0.15)" : "rgba(139, 92, 246, 0.15)",
                    border: `1px solid ${isShipment ? "#3B82F6" : "#8B5CF6"}`,
                    borderRadius: 6,
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                  onClick={() => {
                    if (isShipment) navigate(`/control-tower?search=${q.id}`);
                  }}
                >
                  {isShipment ? (
                    <ShoppingCartOutlined style={{ color: "#60A5FA", fontSize: 12 }} />
                  ) : (
                    <SwapOutlined style={{ color: "#A78BFA", fontSize: 12 }} />
                  )}
                  <span style={{ color: isShipment ? "#BFDBFE" : "#DDD6FE", fontWeight: 500 }}>
                    {q.label || q.id}
                  </span>
                </span>
              );
            })}
          </div>
        )}

        {/* 引用卡片（metadata.shipmentIds 向后兼容） */}
        {message.metadata?.shipmentIds && Array.isArray(message.metadata.shipmentIds) && (
          <div style={{ marginTop: 8 }}>
            {(message.metadata.shipmentIds as string[]).map((sid) => (
              <Tag
                key={sid}
                icon={<ShoppingCartOutlined />}
                color="blue"
                style={{ cursor: "pointer", margin: 0 }}
                onClick={() => navigate(`/control-tower?search=${sid}`)}
              >
                引用了货物 {sid}
              </Tag>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════
//  会话卡片组件
// ═══════════════════════════════════════════════════════════════════════

interface SessionCardProps {
  consultation: Consultation;
  isActive: boolean;
  onClick: () => void;
}

const SessionCard: React.FC<SessionCardProps> = ({
  consultation,
  isActive,
  onClick,
}) => {
  const lastMsg = consultation.messages?.[consultation.messages.length - 1];
  const previewText = lastMsg
    ? lastMsg.content.replace(/\*\*/g, "").slice(0, 40) + (lastMsg.content.length > 40 ? "..." : "")
    : "暂无消息";
  const isUserLast = lastMsg?.senderType === "user";

  return (
    <div
      onClick={onClick}
      style={{
        padding: "12px 16px",
        cursor: "pointer",
        borderBottom: "1px solid #1E293B",
        background: isActive ? "rgba(59, 130, 246, 0.1)" : "transparent",
        borderLeft: isActive ? "3px solid #3B82F6" : "3px solid transparent",
        transition: "all 0.2s",
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          (e.currentTarget as HTMLElement).style.background = "#1E293B";
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          (e.currentTarget as HTMLElement).style.background = "transparent";
        }
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        {/* 头像 */}
        <Avatar
          size={40}
          icon={<RobotOutlined />}
          style={{
            backgroundColor: "#1A365D",
            border: "1px solid #334155",
            flexShrink: 0,
          }}
        />

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* 第一行：主题 + 时间 */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 2,
            }}
          >
            <Text
              strong
              ellipsis
              style={{
                color: isActive ? "#3B82F6" : "#F1F5F9",
                fontSize: 14,
                flex: 1,
              }}
            >
              {consultation.subject}
            </Text>
            <Text style={{ color: "#64748B", fontSize: 11, flexShrink: 0, marginLeft: 8 }}>
              {dayjs(consultation.updatedAt).fromNow()}
            </Text>
          </div>

          {/* 分类 Tag */}
          <div style={{ marginBottom: 4 }}>
            <Tag
              color={CATEGORY_TAG_COLORS[consultation.category] || "default"}
              style={{ fontSize: 11, lineHeight: "18px", padding: "0 6px" }}
            >
              {CATEGORY_LABELS[consultation.category] || consultation.category}
            </Tag>
            {consultation.status === "closed" && (
              <Tag color="default" style={{ fontSize: 11, lineHeight: "18px", padding: "0 6px", marginLeft: 4 }}>
                已关闭
              </Tag>
            )}
          </div>

          {/* 最后消息预览 */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {isUserLast && (
              <UserOutlined style={{ color: "#64748B", fontSize: 11, flexShrink: 0 }} />
            )}
            <Text
              ellipsis
              style={{
                color: "#64748B",
                fontSize: 12,
              }}
            >
              {previewText}
            </Text>
          </div>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════
//  新建咨询弹窗
// ═══════════════════════════════════════════════════════════════════════

const CREATE_CATEGORIES = [
  { value: "tariff", label: "关税筹划" },
  { value: "compliance", label: "合规审核" },
  { value: "optimization", label: "运输方案优化" },
  { value: "document", label: "单证问题" },
  { value: "other", label: "其他" },
];

// ═══════════════════════════════════════════════════════════════════════
//  主页面组件
// ═══════════════════════════════════════════════════════════════════════

const ConsultationPage: React.FC = () => {
  const navigate = useNavigate();

  // ── 状态 ──────────────────────────────────────────────────────────
  const [sessions, setSessions] = useState<Consultation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeConsultation, setActiveConsultation] = useState<Consultation | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [searchText, setSearchText] = useState("");
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);
  const [contextData, setContextData] = useState<ConsultationContext | null>(null);
  const [knowledgeResults, setKnowledgeResults] = useState<KnowledgeArticle[]>([]);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [creating, setCreating] = useState(false);

  // 新建咨询表单状态
  const [newCategory, setNewCategory] = useState("tariff");
  const [newSubject, setNewSubject] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [newShipment, setNewShipment] = useState<string | undefined>(undefined);
  const [newPlan, setNewPlan] = useState<string | undefined>(undefined);

  // 新建咨询下拉选项
  const [shipmentOptions, setShipmentOptions] = useState<{ value: string; label: string }[]>([]);
  const [planOptions] = useState<{ value: string; label: string }[]>([
    // MVP 阶段暂无已保存方案；后续从后端获取
    { value: "plan-demo-1", label: "方案 #1: CNSHA→USLAX 海运 $2,450" },
    { value: "plan-demo-2", label: "方案 #2: CNSHA→USLAX 空运 $8,200" },
  ]);

  // ── 引用（quote）状态 ────────────────────────────────────────────
  const [quoteItems, setQuoteItems] = useState<QuoteItem[]>([]);
  const [showQuotePopover, setShowQuotePopover] = useState(false);
  const [quoteTab, setQuoteTab] = useState<"shipment" | "plan">("shipment");
  const [quoteShipmentSearch, setQuoteShipmentSearch] = useState("");
  const [quoteShipmentResults, setQuoteShipmentResults] = useState<ShipmentItem[]>([]);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

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

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // ── 初次加载货物列表供新建表单使用 ──────────────────────────────
  useEffect(() => {
    fetchShipments({})
      .then((list) => {
        setShipmentOptions(
          list.map((s) => ({
            value: s.bl_number,
            label: `${s.bl_number} — ${s.cargo_desc?.slice(0, 30) || ""} (${s.origin}→${s.destination})`,
          })),
        );
      })
      .catch(() => {});
  }, []);

  // ── 切换会话 ──────────────────────────────────────────────────────
  const switchSession = useCallback(async (id: string) => {
    setActiveId(id);
    setRightSidebarOpen(false);
    setContextData(null);
    try {
      const data = await fetchConsultationMessages(id);
      setActiveConsultation(data);
      loadSessions(); // 后台刷新列表
    } catch (err) {
      console.error("加载会话详情失败:", err);
      message.error("加载会话详情失败");
    }
  }, [loadSessions]);

  // ── 加载上下文 ────────────────────────────────────────────────────
  const loadContext = useCallback(async (id: string) => {
    try {
      const ctx = await fetchContext(id);
      setContextData(ctx);
    } catch {
      // ignore
    }
  }, []);

  // ── 加载知识库推荐 ────────────────────────────────────────────────
  const loadKnowledge = useCallback(async (query: string) => {
    if (!query.trim()) {
      setKnowledgeResults([]);
      return;
    }
    try {
      const results = await searchKnowledge(query);
      setKnowledgeResults(results.slice(0, 5));
    } catch {
      // ignore
    }
  }, []);

  // ── 发送消息 ──────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || !activeId || sending) return;

    setSending(true);
    setInputValue("");

    // 构建 metadata，包含引用信息
    const metadata: Record<string, unknown> = {};
    if (quoteItems.length > 0) {
      metadata.quote = quoteItems;
    }
    setQuoteItems([]);

    try {
      // 先发送用户消息
      await sendMessage(activeId, { content: text, metadata });

      // 重新加载完整会话（包含 AI 回复）
      const updated = await fetchConsultationMessages(activeId);
      setActiveConsultation(updated);

      // 更新列表中的最后消息预览
      setSessions((prev) =>
        prev.map((s) => (s.id === activeId ? { ...s, updatedAt: updated.updatedAt } : s)),
      );

      // 异步加载上下文和知识推荐
      loadContext(activeId);
      loadKnowledge(text);
    } catch (err) {
      console.error("发送消息失败:", err);
      message.error("发送失败，请重试");
    } finally {
      setSending(false);
      textAreaRef.current?.focus();
    }
  }, [inputValue, activeId, sending, quoteItems, loadContext, loadKnowledge]);

  // ── 关闭会话 ──────────────────────────────────────────────────────
  const handleCloseSession = useCallback(async () => {
    if (!activeId) return;
    try {
      const updated = await closeConsultation(activeId);
      setActiveConsultation(updated);
      loadSessions();
    } catch (err) {
      console.error("关闭会话失败:", err);
      message.error("关闭失败");
    }
  }, [activeId, loadSessions]);

  // ── 创建新会话 ────────────────────────────────────────────────────
  const handleCreate = useCallback(async () => {
    if (!newSubject.trim()) {
      message.warning("请输入咨询主题");
      return;
    }
    setCreating(true);
    try {
      // 构建初始消息：包含关联货物/方案信息
      let initialMsg = newMessage.trim();
      const refs: string[] = [];
      if (newShipment) refs.push(`引用了货物 ${newShipment}`);
      if (newPlan) refs.push(`引用了方案 ${newPlan}`);
      if (refs.length > 0) {
        const prefix = refs.join("，");
        initialMsg = initialMsg ? `${initialMsg}\n\n[${prefix}]` : `[${prefix}]`;
      }

      const req: CreateConsultationRequest = {
        subject: newSubject.trim(),
        category: newCategory,
      };
      if (initialMsg) {
        req.initialMessage = initialMsg;
      }
      const created = await createConsultation(req);

      // 重置表单
      setShowNewDialog(false);
      setNewSubject("");
      setNewMessage("");
      setNewCategory("tariff");
      setNewShipment(undefined);
      setNewPlan(undefined);

      // 刷新列表并切换到新会话
      await loadSessions();
      await switchSession(created.id);
    } catch (err) {
      console.error("创建会话失败:", err);
      message.error("创建失败，请重试");
    } finally {
      setCreating(false);
    }
  }, [newSubject, newCategory, newMessage, newShipment, newPlan, loadSessions, switchSession]);

  // ── 搜索引用货物（Popover 内使用） ──────────────────────────────
  const loadQuoteShipments = useCallback(async (q: string) => {
    if (!q.trim()) {
      setQuoteShipmentResults([]);
      return;
    }
    try {
      const results = await fetchShipments({ search: q });
      setQuoteShipmentResults(results);
    } catch {
      setQuoteShipmentResults([]);
    }
  }, []);

  // ── 添加引用项 ────────────────────────────────────────────────────
  const addQuote = useCallback((item: QuoteItem) => {
    setQuoteItems((prev) => {
      if (prev.some((q) => q.type === item.type && q.id === item.id)) return prev;
      return [...prev, item];
    });
    setShowQuotePopover(false);
    setQuoteShipmentSearch("");
    textAreaRef.current?.focus();
  }, []);

  // ── 删除引用项 ────────────────────────────────────────────────────
  const removeQuote = useCallback((type: string, id: string) => {
    setQuoteItems((prev) => prev.filter((q) => !(q.type === type && q.id === id)));
  }, []);

  // ── 自动滚动到底部 ────────────────────────────────────────────────
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

  // ── 过滤后的会话列表 ──────────────────────────────────────────────
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

  // ── 当前会话 ──────────────────────────────────────────────────────
  const currentSession = activeConsultation;

  // ── 处理 input 变化 ──────────────────────────────────────────────
  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInputValue(e.target.value);
    },
    [],
  );

  // ═══════════════════════════════════════════════════════════════════
  //  Render
  // ═══════════════════════════════════════════════════════════════════

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
            animate={{ width: LIST_WIDTH, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              width: LIST_WIDTH,
              minWidth: LIST_WIDTH,
              height: "100%",
              display: "flex",
              flexDirection: "column",
              borderRight: "1px solid #1E293B",
              background: "#0F172A",
              overflow: "hidden",
            }}
          >
            {/* 搜索框 */}
            <div style={{ padding: "12px 12px 8px" }}>
              <Input
                prefix={<SearchOutlined style={{ color: "#64748B" }} />}
                placeholder="搜索会话或消息..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                variant="borderless"
                style={{
                  background: "#1E293B",
                  borderRadius: 8,
                  color: "#F1F5F9",
                  height: 38,
                }}
              />
            </div>

            {/* 会话列表 */}
            <div style={{ flex: 1, overflow: "auto" }}>
              {loading && sessions.length === 0 ? (
                <div style={{ textAlign: "center", padding: 40 }}>
                  <Spin indicator={<LoadingOutlined style={{ fontSize: 24, color: "#3B82F6" }} />} />
                </div>
              ) : filteredSessions.length === 0 ? (
                <div style={{ padding: 40 }}>
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={
                      <Text style={{ color: "#64748B" }}>
                        {searchText ? "未找到匹配的会话" : "暂无咨询记录"}
                      </Text>
                    }
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

            {/* 新建按钮 */}
            <div
              style={{
                padding: 12,
                borderTop: "1px solid #1E293B",
              }}
            >
              <Button
                type="primary"
                block
                size="large"
                icon={<PlusOutlined />}
                onClick={() => setShowNewDialog(true)}
                style={{ borderRadius: 8, height: 44, fontWeight: 600 }}
              >
                新建咨询
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 折叠左侧按钮 */}
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
          transition: "background 0.2s",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = "#1E293B";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = "transparent";
        }}
      >
        {leftCollapsed ? <RightOutlined style={{ fontSize: 12 }} /> : <LeftOutlined style={{ fontSize: 12 }} />}
      </div>

      {/* ══════════════════════════════════════════════════════════════
          右侧：对话与协作区
          ══════════════════════════════════════════════════════════════ */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          height: "100%",
          background: "#0F172A",
          minWidth: 0,
        }}
      >
        {currentSession ? (
          <>
            {/* ── 顶部栏 ────────────────────────────────────────── */}
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
                <Title level={5} style={{ margin: 0, color: "#F1F5F9" }}>
                  {currentSession.subject}
                </Title>
                <Tag color={STATUS_TAG_COLORS[currentSession.status]}>
                  {STATUS_LABELS[currentSession.status]}
                </Tag>
                <Tag color={CATEGORY_TAG_COLORS[currentSession.category] || "default"}>
                  {CATEGORY_LABELS[currentSession.category] || currentSession.category}
                </Tag>
              </div>

              <Space size="small">
                <Tooltip title="刷新">
                  <Button
                    type="text"
                    icon={<ReloadOutlined />}
                    onClick={() => switchSession(currentSession.id)}
                    style={{ color: "#94A3B8" }}
                  />
                </Tooltip>
                <Tooltip title="上下文面板">
                  <Button
                    type="text"
                    icon={<ReadOutlined />}
                    onClick={() => {
                      setRightSidebarOpen(!rightSidebarOpen);
                      if (!contextData) loadContext(currentSession.id);
                    }}
                    style={{
                      color: rightSidebarOpen ? "#3B82F6" : "#94A3B8",
                    }}
                  />
                </Tooltip>
                {currentSession.status === "active" && (
                  <Tooltip title="关闭咨询">
                    <Button
                      type="text"
                      icon={<CloseOutlined />}
                      onClick={handleCloseSession}
                      style={{ color: "#EF4444" }}
                    />
                  </Tooltip>
                )}
              </Space>
            </div>

            {/* ── 消息流 ────────────────────────────────────────── */}
            <div
              ref={messagesContainerRef}
              style={{
                flex: 1,
                overflow: "auto",
                padding: "16px 20px",
              }}
            >
              {currentSession.messages.length === 0 ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100%",
                    gap: 12,
                  }}
                >
                  <RobotOutlined style={{ fontSize: 48, color: "#334155" }} />
                  <Text style={{ color: "#64748B", fontSize: 15 }}>
                    开始对话，输入您的物流咨询问题
                  </Text>
                  <Text style={{ color: "#475569", fontSize: 13, textAlign: "center", maxWidth: 400 }}>
                    例如：查询 HS 编码 610910 的合规要求、了解从上海到洛杉矶的运费、
                    或追踪货物 BL202606001 的状态
                  </Text>
                </div>
              ) : (
                currentSession.messages.map((msg) => (
                  <MessageBubble key={msg.id} message={msg} />
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* ── 底部输入区 ────────────────────────────────────── */}
            <div
              style={{
                borderTop: "1px solid #1E293B",
                padding: "12px 20px 16px",
                flexShrink: 0,
                background: "#0F172A",
              }}
            >
              {/* 工具栏 */}
              <Space style={{ marginBottom: 8 }} size="small">
                {/* 引用按钮 */}
                <Popover
                  content={
                    <div style={{ width: 320 }}>
                      {/* Tab 切换 */}
                      <div style={{ display: "flex", gap: 0, marginBottom: 10, borderBottom: "1px solid #1E293B" }}>
                        <Button
                          type="text"
                          size="small"
                          onClick={() => setQuoteTab("shipment")}
                          style={{
                            flex: 1,
                            color: quoteTab === "shipment" ? "#3B82F6" : "#64748B",
                            fontWeight: quoteTab === "shipment" ? 600 : 400,
                            borderBottom: quoteTab === "shipment" ? "2px solid #3B82F6" : "2px solid transparent",
                            borderRadius: 0,
                          }}
                        >
                          引用货物
                        </Button>
                        <Button
                          type="text"
                          size="small"
                          onClick={() => setQuoteTab("plan")}
                          style={{
                            flex: 1,
                            color: quoteTab === "plan" ? "#3B82F6" : "#64748B",
                            fontWeight: quoteTab === "plan" ? 600 : 400,
                            borderBottom: quoteTab === "plan" ? "2px solid #3B82F6" : "2px solid transparent",
                            borderRadius: 0,
                          }}
                        >
                          引用方案
                        </Button>
                      </div>

                      {quoteTab === "shipment" ? (
                        <>
                          <Input
                            prefix={<SearchOutlined style={{ color: "#64748B" }} />}
                            placeholder="搜索提单号或货物名称..."
                            value={quoteShipmentSearch}
                            onChange={(e) => {
                              setQuoteShipmentSearch(e.target.value);
                              loadQuoteShipments(e.target.value);
                            }}
                            variant="borderless"
                            style={{ background: "#1E293B", borderRadius: 6, marginBottom: 8, color: "#F1F5F9" }}
                          />
                          {quoteShipmentSearch.trim() ? (
                            quoteShipmentResults.length === 0 ? (
                              <Text style={{ color: "#64748B", fontSize: 13, display: "block", padding: "8px 4px" }}>未找到匹配货物</Text>
                            ) : (
                              quoteShipmentResults.map((s) => (
                                <div
                                  key={s.bl_number}
                                  onClick={() =>
                                    addQuote({
                                      type: "shipment",
                                      id: s.bl_number,
                                      label: s.bl_number,
                                      sublabel: `${s.origin}→${s.destination}`,
                                    })
                                  }
                                  style={{
                                    padding: "8px 10px",
                                    cursor: "pointer",
                                    borderRadius: 6,
                                    marginBottom: 4,
                                    transition: "background 0.15s",
                                  }}
                                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#1E293B"; }}
                                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                                >
                                  <Text style={{ color: "#F1F5F9", fontSize: 13 }}>{s.bl_number}</Text>
                                  <br />
                                  <Text style={{ color: "#64748B", fontSize: 12 }}>
                                    {s.cargo_desc} | {s.origin} → {s.destination}
                                  </Text>
                                </div>
                              ))
                            )
                          ) : (
                            <Text style={{ color: "#475569", fontSize: 13, display: "block", padding: "8px 4px" }}>
                              请输入提单号或货物名称搜索
                            </Text>
                          )}
                        </>
                      ) : (
                        <>
                          <Input
                            prefix={<SearchOutlined style={{ color: "#64748B" }} />}
                            placeholder="搜索方案..."
                            variant="borderless"
                            style={{ background: "#1E293B", borderRadius: 6, marginBottom: 8, color: "#F1F5F9" }}
                          />
                          {planOptions.length > 0 ? (
                            planOptions.map((p) => (
                              <div
                                key={p.value}
                                onClick={() =>
                                  addQuote({
                                    type: "plan",
                                    id: p.value,
                                    label: p.label,
                                  })
                                }
                                style={{
                                  padding: "8px 10px",
                                  cursor: "pointer",
                                  borderRadius: 6,
                                  marginBottom: 4,
                                  transition: "background 0.15s",
                                }}
                                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#1E293B"; }}
                                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                              >
                                <Text style={{ color: "#F1F5F9", fontSize: 13 }}>{p.label}</Text>
                              </div>
                            ))
                          ) : (
                            <Text style={{ color: "#475569", fontSize: 13, display: "block", padding: "8px 4px" }}>
                              暂无已保存方案
                            </Text>
                          )}
                        </>
                      )}
                    </div>
                  }
                  title="引用"
                  trigger="click"
                  open={showQuotePopover}
                  onOpenChange={setShowQuotePopover}
                >
                  <Button
                    size="small"
                    icon={<LinkOutlined />}
                    style={{ color: quoteItems.length > 0 ? "#3B82F6" : "#94A3B8", borderColor: "#334155" }}
                  >
                    引用{quoteItems.length > 0 ? ` (${quoteItems.length})` : ""}
                  </Button>
                </Popover>

                <Upload
                  beforeUpload={() => false}
                  showUploadList={false}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                >
                  <Button
                    size="small"
                    icon={<PaperClipOutlined />}
                    style={{ color: "#94A3B8", borderColor: "#334155" }}
                  >
                    上传文件
                  </Button>
                </Upload>
              </Space>

              {/* 引用标签（已选中的引用项，显示在输入框上方） */}
              {quoteItems.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 6,
                    marginBottom: 8,
                    padding: "6px 10px",
                    background: "#1E293B",
                    borderRadius: 8,
                  }}
                >
                  {quoteItems.map((q) => (
                    <span
                      key={`${q.type}-${q.id}`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "2px 8px",
                        background: q.type === "shipment" ? "rgba(59,130,246,0.15)" : "rgba(139,92,246,0.15)",
                        border: `1px solid ${q.type === "shipment" ? "#3B82F6" : "#8B5CF6"}`,
                        borderRadius: 4,
                        fontSize: 12,
                      }}
                    >
                      {q.type === "shipment" ? (
                        <ShoppingCartOutlined style={{ color: "#60A5FA", fontSize: 11 }} />
                      ) : (
                        <SwapOutlined style={{ color: "#A78BFA", fontSize: 11 }} />
                      )}
                      <span style={{ color: "#CBD5E1", fontSize: 12 }}>{q.label}</span>
                      <CloseOutlined
                        style={{ color: "#64748B", fontSize: 10, cursor: "pointer", marginLeft: 2 }}
                        onClick={() => removeQuote(q.type, q.id)}
                      />
                    </span>
                  ))}
                </div>
              )}

              {/* 输入框 + 发送按钮 */}
              <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                <TextArea
                  ref={textAreaRef as React.Ref<any>}
                  value={inputValue}
                  onChange={onInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="输入您的咨询问题，Enter 发送，Shift+Enter 换行..."
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
                  }}
                />
              </div>
            </div>
          </>
        ) : (
          /* ── 未选中会话时的占位 ────────────────────────────── */
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: 16,
            }}
          >
            <MessageOutlined style={{ fontSize: 56, color: "#334155" }} />
            <Title level={4} style={{ color: "#64748B", margin: 0, fontWeight: 400 }}>
              选择或创建一个咨询会话
            </Title>
            <Text style={{ color: "#475569", maxWidth: 420, textAlign: "center" }}>
              LogiBridge AI 顾问可以帮您分析合规风险、估算运费、解答报关问题，
              并提供实时货物追踪信息。
            </Text>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              size="large"
              onClick={() => setShowNewDialog(true)}
              style={{ borderRadius: 8, marginTop: 8 }}
            >
              新建咨询
            </Button>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════
          右侧边栏（上下文面板）
          ══════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {rightSidebarOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: SIDEBAR_WIDTH, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              width: SIDEBAR_WIDTH,
              minWidth: SIDEBAR_WIDTH,
              height: "100%",
              borderLeft: "1px solid #1E293B",
              background: "#0F172A",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {/* 标题 */}
            <div
              style={{
                padding: "14px 16px",
                borderBottom: "1px solid #1E293B",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Text strong style={{ color: "#F1F5F9", fontSize: 14 }}>
                上下文信息
              </Text>
              <Button
                type="text"
                size="small"
                icon={<CloseOutlined />}
                onClick={() => setRightSidebarOpen(false)}
                style={{ color: "#64748B" }}
              />
            </div>

            {/* 内容 */}
            <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
              {/* 关联货物 */}
              {contextData && contextData.referencedShipments.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <Text strong style={{ color: "#94A3B8", fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>
                    关联货物
                  </Text>
                  <Divider style={{ margin: "8px 0", borderColor: "#1E293B" }} />
                  {contextData.referencedShipments.map((ship) => (
                    <Card
                      key={ship.blNumber}
                      size="small"
                      hoverable
                      style={{
                        background: "#1E293B",
                        border: "1px solid #334155",
                        borderRadius: 8,
                        marginBottom: 8,
                      }}
                      onClick={() => navigate(`/control-tower?search=${ship.blNumber}`)}
                    >
                      <Text strong style={{ color: "#3B82F6", fontSize: 13 }}>
                        {ship.blNumber}
                      </Text>
                      <div style={{ marginTop: 4 }}>
                        <Text style={{ color: "#CBD5E1", fontSize: 12 }}>{ship.cargoDesc}</Text>
                      </div>
                      <div style={{ marginTop: 4, fontSize: 12, color: "#64748B" }}>
                        {ship.origin} → {ship.destination}
                      </div>
                      <Tag
                        color={ship.status === "delayed" ? "red" : "blue"}
                        style={{ marginTop: 6, fontSize: 11 }}
                      >
                        {ship.status === "in_transit"
                          ? "运输中"
                          : ship.status === "delayed"
                            ? "延误"
                            : ship.status === "delivered"
                              ? "已交付"
                              : ship.status}
                      </Tag>
                    </Card>
                  ))}
                </div>
              )}

              {/* 知识库推荐 */}
              {knowledgeResults.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <Text
                    strong
                    style={{
                      color: "#94A3B8",
                      fontSize: 12,
                      textTransform: "uppercase",
                      letterSpacing: 1,
                    }}
                  >
                    AI 推荐知识
                  </Text>
                  <Divider style={{ margin: "8px 0", borderColor: "#1E293B" }} />
                  {knowledgeResults.map((article) => (
                    <Popover
                      key={article.id}
                      content={
                        <div style={{ maxWidth: 300 }}>
                          <Text strong style={{ color: "#F1F5F9" }}>
                            {article.title}
                          </Text>
                          <Paragraph
                            style={{ color: "#CBD5E1", fontSize: 13, marginTop: 8 }}
                          >
                            {article.content}
                          </Paragraph>
                          <Space size={4}>
                            {article.tags.map((tag) => (
                              <Tag key={tag} style={{ fontSize: 11 }}>
                                {tag}
                              </Tag>
                            ))}
                          </Space>
                        </div>
                      }
                      title="知识库文章"
                      trigger="hover"
                    >
                      <div
                        style={{
                          padding: "10px 12px",
                          background: "#1E293B",
                          border: "1px solid #334155",
                          borderRadius: 8,
                          marginBottom: 8,
                          cursor: "pointer",
                        }}
                      >
                        <Space>
                          <ReadOutlined style={{ color: "#3B82F6", fontSize: 14 }} />
                          <Text style={{ color: "#CBD5E1", fontSize: 13 }}>
                            {article.title}
                          </Text>
                        </Space>
                      </div>
                    </Popover>
                  ))}
                </div>
              )}

              {/* 空状态 */}
              {(!contextData || contextData.referencedShipments.length === 0) &&
                knowledgeResults.length === 0 && (
                  <div style={{ textAlign: "center", padding: 24, color: "#475569" }}>
                    <FolderOpenOutlined style={{ fontSize: 32, color: "#334155" }} />
                    <div style={{ marginTop: 8, fontSize: 13 }}>暂无关联上下文</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>
                      发送消息后，系统会自动关联相关货物和知识
                    </div>
                  </div>
                )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════════════
          新建咨询模态框
          ══════════════════════════════════════════════════════════════ */}
      <Modal
        title="发起新的咨询"
        open={showNewDialog}
        onCancel={() => setShowNewDialog(false)}
        width={520}
        styles={{
          header: { background: "#0F172A", color: "#F1F5F9", borderBottom: "1px solid #1E293B", paddingBottom: 16 },
          body: { background: "#0F172A", paddingTop: 20 },
          footer: { background: "#0F172A", borderTop: "1px solid #1E293B", paddingTop: 12 },
          mask: { background: "rgba(0,0,0,0.6)" },
          content: { background: "#0F172A", borderRadius: 12, border: "1px solid #1E293B" },
        }}
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <Button onClick={() => setShowNewDialog(false)}>
              取消
            </Button>
            <Button
              type="primary"
              loading={creating}
              onClick={handleCreate}
              disabled={!newSubject.trim()}
              style={{ borderRadius: 6 }}
            >
              确定
            </Button>
          </div>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* 咨询类型 */}
          <div>
            <Text strong style={{ color: "#CBD5E1", display: "block", marginBottom: 6, fontSize: 13 }}>
              咨询类型 <span style={{ color: "#EF4444" }}>*</span>
            </Text>
            <Select
              value={newCategory}
              onChange={setNewCategory}
              style={{ width: "100%" }}
              variant="borderless"
              options={CREATE_CATEGORIES}
            />
          </div>

          {/* 主题 */}
          <div>
            <Text strong style={{ color: "#CBD5E1", display: "block", marginBottom: 6, fontSize: 13 }}>
              主题 <span style={{ color: "#EF4444" }}>*</span>
            </Text>
            <Input
              placeholder="请输入咨询主题"
              value={newSubject}
              onChange={(e) => setNewSubject(e.target.value)}
              variant="borderless"
              style={{ background: "#1E293B", borderRadius: 8, color: "#F1F5F9" }}
            />
          </div>

          {/* 初始描述 */}
          <div>
            <Text strong style={{ color: "#CBD5E1", display: "block", marginBottom: 6, fontSize: 13 }}>
              初始描述
            </Text>
            <TextArea
              placeholder="请描述您想咨询的具体问题..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              rows={4}
              variant="borderless"
              style={{ background: "#1E293B", borderRadius: 8, color: "#F1F5F9", resize: "none" }}
            />
          </div>

          {/* 关联货物 */}
          <div>
            <Text strong style={{ color: "#CBD5E1", display: "block", marginBottom: 6, fontSize: 13 }}>
              关联货物
            </Text>
            <Select
              value={newShipment}
              onChange={setNewShipment}
              style={{ width: "100%" }}
              placeholder="选择关联的货物（可选）"
              variant="borderless"
              allowClear
              showSearch
              filterOption={(input, option) =>
                (option?.label as string ?? "").toLowerCase().includes(input.toLowerCase())
              }
              options={shipmentOptions.length > 0 ? shipmentOptions : [{ value: "BL202606001", label: "BL202606001 — Cotton T-Shirts (CNSGH→USLAX)" }, { value: "BL202606002", label: "BL202606002 — Lithium Batteries (CNNGB→NLRTM)" }]}
            />
          </div>

          {/* 关联方案 */}
          <div>
            <Text strong style={{ color: "#CBD5E1", display: "block", marginBottom: 6, fontSize: 13 }}>
              关联方案
            </Text>
            <Select
              value={newPlan}
              onChange={setNewPlan}
              style={{ width: "100%" }}
              placeholder="选择关联的方案（可选）"
              variant="borderless"
              allowClear
              options={planOptions}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ConsultationPage;
