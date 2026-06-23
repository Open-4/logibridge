import { motion } from "framer-motion";
import { Avatar, Button, Tag, Typography, Space, Tooltip, Card } from "antd";
import {
  UserOutlined,
  RobotOutlined,
  CustomerServiceOutlined,
  FileOutlined,
  DownloadOutlined,
  RightOutlined,
  SwapOutlined,
  SafetyOutlined,
  ReadOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import type { Message } from "../../api/consultationApi";

const { Text } = Typography;

// ── Props ──────────────────────────────────────────────────────────

export interface MessageBubbleProps {
  /** 消息对象 */
  message: Message;
  /** 是否为最后一条消息（用于控制时间展示等逻辑） */
  isLast?: boolean;
}

// ── 辅助类型 ───────────────────────────────────────────────────────

interface QuoteBlock {
  text: string;
  source?: string;
}

interface KnowledgeCard {
  title: string;
  summary: string;
  url?: string;
}

interface ShipmentCard {
  blNumber: string;
  status: string;
  origin: string;
  destination: string;
}

interface PlanCard {
  type: string;
  totalCost: string;
  routeSummary: string;
}

// ── 子组件 ─────────────────────────────────────────────────────────

/** 文件附件卡片 */
const AttachmentCard: React.FC<{
  attachment: { name?: string; url?: string; type?: string };
}> = ({ attachment }) => {
  const size = attachment.type
    ? attachment.type.toUpperCase().replace(/^.*\//, "")
    : "FILE";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 12px",
        background: "rgba(255,255,255,0.06)",
        borderRadius: 8,
        border: "1px solid rgba(255,255,255,0.1)",
        marginTop: 8,
      }}
    >
      <FileOutlined style={{ color: "#60A5FA", fontSize: 18 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Text
          ellipsis
          style={{ color: "#E2E8F0", fontSize: 13, display: "block" }}
        >
          {attachment.name || "附件"}
        </Text>
        <Text style={{ color: "#64748B", fontSize: 11 }}>{size}</Text>
      </div>
      {attachment.url && (
        <Tooltip title="下载">
          <Button
            type="text"
            size="small"
            icon={<DownloadOutlined />}
            onClick={() => window.open(attachment.url, "_blank")}
            style={{ color: "#94A3B8" }}
          />
        </Tooltip>
      )}
    </div>
  );
};

/** 引用块 */
const QuoteBlock: React.FC<{ quote: QuoteBlock }> = ({ quote }) => (
  <div
    style={{
      marginTop: 8,
      padding: "8px 12px",
      paddingLeft: 14,
      borderLeft: "3px solid #3B82F6",
      background: "rgba(59,130,246,0.08)",
      borderRadius: "0 6px 6px 0",
    }}
  >
    <Text
      style={{
        color: "#94A3B8",
        fontSize: 13,
        fontStyle: "italic",
        display: "block",
      }}
    >
      {quote.text}
    </Text>
    {quote.source && (
      <Text style={{ color: "#64748B", fontSize: 11, marginTop: 4, display: "block" }}>
        — {quote.source}
      </Text>
    )}
  </div>
);

/** 知识库推荐卡片 */
const KnowledgeRecommendCard: React.FC<{ data: KnowledgeCard }> = ({
  data,
}) => (
  <Card
    size="small"
    hoverable
    style={{
      marginTop: 8,
      background: "rgba(59,130,246,0.06)",
      border: "1px solid rgba(59,130,246,0.2)",
      borderRadius: 8,
    }}
    onClick={() => data.url && window.open(data.url, "_blank")}
  >
    <Space direction="vertical" size={4} style={{ width: "100%" }}>
      <Space>
        <ReadOutlined style={{ color: "#60A5FA", fontSize: 14 }} />
        <Text style={{ color: "#E2E8F0", fontSize: 13, fontWeight: 600 }}>
          {data.title}
        </Text>
      </Space>
      <Text style={{ color: "#94A3B8", fontSize: 12 }}>{data.summary}</Text>
      <Space>
        <Text style={{ color: "#3B82F6", fontSize: 12 }}>查看详情</Text>
        <RightOutlined style={{ color: "#3B82F6", fontSize: 11 }} />
      </Space>
    </Space>
  </Card>
);

/** 货物卡片 */
const ShipmentInfoCard: React.FC<{ data: ShipmentCard }> = ({ data }) => {
  const statusColor: Record<string, string> = {
    in_transit: "blue",
    delivered: "green",
    delayed: "red",
    customs_clearance: "orange",
  };
  return (
    <Card
      size="small"
      hoverable
      style={{
        marginTop: 8,
        background: "rgba(59,130,246,0.06)",
        border: "1px solid rgba(59,130,246,0.2)",
        borderRadius: 8,
      }}
    >
      <Space direction="vertical" size={4} style={{ width: "100%" }}>
        <Space>
          <SwapOutlined style={{ color: "#60A5FA", fontSize: 14 }} />
          <Text style={{ color: "#3B82F6", fontSize: 13, fontWeight: 600 }}>
            {data.blNumber}
          </Text>
          <Tag
            color={statusColor[data.status] || "default"}
            style={{ fontSize: 11, lineHeight: "18px" }}
          >
            {data.status === "in_transit"
              ? "在途"
              : data.status === "delayed"
                ? "延误"
                : data.status === "delivered"
                  ? "已交付"
                  : data.status}
          </Tag>
        </Space>
        <Text style={{ color: "#94A3B8", fontSize: 12 }}>
          {data.origin} → {data.destination}
        </Text>
        <Space>
          <Text style={{ color: "#3B82F6", fontSize: 12 }}>查看轨迹</Text>
          <RightOutlined style={{ color: "#3B82F6", fontSize: 11 }} />
        </Space>
      </Space>
    </Card>
  );
};

/** 方案卡片 */
const PlanInfoCard: React.FC<{ data: PlanCard }> = ({ data }) => (
  <Card
    size="small"
    hoverable
    style={{
      marginTop: 8,
      background: "rgba(59,130,246,0.06)",
      border: "1px solid rgba(59,130,246,0.2)",
      borderRadius: 8,
    }}
  >
    <Space direction="vertical" size={4} style={{ width: "100%" }}>
      <Space>
        <SafetyOutlined style={{ color: "#34D399", fontSize: 14 }} />
        <Tag color="green" style={{ fontSize: 11, lineHeight: "18px" }}>
          {data.type}
        </Tag>
      </Space>
      <Space>
        <Text style={{ color: "#94A3B8", fontSize: 12 }}>总费用</Text>
        <Text style={{ color: "#34D399", fontSize: 13, fontWeight: 600 }}>
          {data.totalCost}
        </Text>
      </Space>
      <Text style={{ color: "#94A3B8", fontSize: 12 }}>
        {data.routeSummary}
      </Text>
      <Space>
        <Text style={{ color: "#3B82F6", fontSize: 12 }}>查看方案</Text>
        <RightOutlined style={{ color: "#3B82F6", fontSize: 11 }} />
      </Space>
    </Space>
  </Card>
);

// ═══════════════════════════════════════════════════════════════════
//  主组件
// ═══════════════════════════════════════════════════════════════════

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, isLast }) => {
  const senderType = message.senderType;
  const isUser = senderType === "user";
  const isConsultant = senderType === "consultant";
  const isAI = senderType === "ai";
  const isSystem = senderType === "system";

  // ── 解析 metadata ─────────────────────────────────────────────────

  const quote: QuoteBlock | null = message.metadata?.quote
    ? (message.metadata.quote as QuoteBlock)
    : null;

  const cardType: string | null = message.metadata?.cardType
    ? (message.metadata.cardType as string)
    : null;

  const knowledgeCard: KnowledgeCard | null =
    cardType === "knowledge" && message.metadata?.cardData
      ? (message.metadata.cardData as KnowledgeCard)
      : null;

  const shipmentCard: ShipmentCard | null =
    cardType === "shipment" && message.metadata?.cardData
      ? (message.metadata.cardData as ShipmentCard)
      : null;

  const planCard: PlanCard | null =
    cardType === "plan" && message.metadata?.cardData
      ? (message.metadata.cardData as PlanCard)
      : null;

  // ── 样式计算 ────────────────────────────────────────────────────

  const isLeft = !isUser && !isSystem;
  const bubbleBg = isUser
    ? "#3B82F6"
    : isConsultant
      ? "#312E4B"
      : isAI
        ? "#1A365D"
        : "#1E293B";

  const bubbleBorderRadius = isUser
    ? "12px 12px 4px 12px"
    : "12px 12px 12px 4px";

  const bubbleTextColor = isUser ? "#FFFFFF" : "#F1F5F9";
  const avatarBg = isUser
    ? "#3B82F6"
    : isConsultant
      ? "#7C3AED"
      : isAI
        ? "#1A365D"
        : "#334155";

  const avatarIcon = isUser
    ? UserOutlined
    : isAI
      ? RobotOutlined
      : CustomerServiceOutlined;

  // ── 内容渲染 ────────────────────────────────────────────────────

  const renderContent = (text: string) => {
    const lines = text.split("\n");
    return lines.map((line, i) => (
      <div key={i} style={{ minHeight: 20 }}>
        <Text
          style={{
            color: bubbleTextColor,
            whiteSpace: "pre-wrap",
            fontSize: 14,
            lineHeight: 1.6,
          }}
        >
          {line}
        </Text>
        {i < lines.length - 1 && <br />}
      </div>
    ));
  };

  // ═══════════════════════════════════════════════════════════════
  //  系统消息 — 居中显示
  // ═══════════════════════════════════════════════════════════════

  if (isSystem) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        style={{ textAlign: "center", margin: "12px 0" }}
      >
        <Tag
          color="default"
          style={{ fontSize: 12, opacity: 0.7, borderRadius: 4 }}
        >
          {message.content}
        </Tag>
      </motion.div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  //  普通消息（user / ai / consultant）
  // ═══════════════════════════════════════════════════════════════

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      style={{
        display: "flex",
        gap: 10,
        marginBottom: 4,
        flexDirection: isUser ? "row-reverse" : "row",
      }}
    >
      {/* 头像 — 仅非 user 显示 */}
      {!isUser && (
        <Avatar
          size={34}
          icon={null}
          style={{
            backgroundColor: avatarBg,
            border: isAI ? "1px solid #3B82F6" : "1px solid #475569",
            flexShrink: 0,
            marginTop: 4,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
          }}
        >
          {isConsultant ? (
            <CustomerServiceOutlined style={{ color: "#F1F5F9", fontSize: 16 }} />
          ) : isAI ? (
            <RobotOutlined style={{ color: "#E2E8F0", fontSize: 16 }} />
          ) : (
            <UserOutlined style={{ color: "#F1F5F9", fontSize: 16 }} />
          )}
        </Avatar>
      )}

      {/* 气泡内容 */}
      <div
        style={{
          maxWidth: "72%",
          minWidth: 60,
          display: "flex",
          flexDirection: "column",
          alignItems: isUser ? "flex-end" : "flex-start",
        }}
      >
        {/* 发送者标签 + 时间 (第一行) */}
        <div
          style={{
            fontSize: 11,
            color: "#64748B",
            marginBottom: 2,
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexDirection: isUser ? "row-reverse" : "row",
          }}
        >
          <span>
            {isUser
              ? "我"
              : isAI
                ? "AI 顾问"
                : isConsultant
                  ? "人工顾问"
                  : ""}
          </span>
          <span style={{ fontSize: 11, color: "#475569" }}>
            {dayjs(message.createdAt).format("HH:mm")}
          </span>
        </div>

        {/* 气泡主体 */}
        <div
          style={{
            padding: "10px 14px",
            borderRadius: bubbleBorderRadius,
            background: bubbleBg,
            border: isAI ? "1px solid rgba(59,130,246,0.2)" : "none",
            lineHeight: 1.6,
            fontSize: 14,
          }}
        >
          {renderContent(message.content)}

          {/* 引用块 — 渲染在气泡内 */}
          {quote && <QuoteBlock quote={quote} />}
        </div>

        {/* 附件列表 — 在气泡下方 */}
        {message.attachments.length > 0 && (
          <div style={{ width: "100%" }}>
            {message.attachments.map((att, idx) => (
              <AttachmentCard key={idx} attachment={att} />
            ))}
          </div>
        )}

        {/* 特殊卡片 — 在气泡下方 */}
        {knowledgeCard && <KnowledgeRecommendCard data={knowledgeCard} />}
        {shipmentCard && <ShipmentInfoCard data={shipmentCard} />}
        {planCard && <PlanInfoCard data={planCard} />}

        {/* 最后一条消息底部的时间线指示 */}
        {isLast && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              marginTop: 2,
              padding: "0 4px",
            }}
          >
            <ClockCircleOutlined style={{ color: "#475569", fontSize: 10 }} />
            <Text style={{ color: "#475569", fontSize: 10 }}>
              {dayjs(message.createdAt).format("HH:mm")}
            </Text>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default MessageBubble;
