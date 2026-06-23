/**
 * KnowledgeCard.tsx — AI 推荐知识卡片组件
 *
 * 在咨询对话中展示 AI 推荐的知识库文章。
 *
 * Props:
 *   title   — 文章标题
 *   content — 内容摘要（最多 2 行截断）
 *   url     — 详情链接（点击 "查看详情" 跳转）
 */

import { Card, Tag, Typography } from "antd";
import { ReadOutlined } from "@ant-design/icons";

const { Text } = Typography;

interface KnowledgeCardProps {
  title: string;
  content: string;
  url?: string;
}

const KnowledgeCard: React.FC<KnowledgeCardProps> = ({ title, content, url }) => {
  const handleClick = () => {
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <Card
      size="small"
      style={{
        background: "#0F172A",
        border: "1px solid #334155",
        borderRadius: 6,
        width: "100%",
      }}
      styles={{
        body: { padding: "12px 14px" },
      }}
    >
      {/* 左上角标签 */}
      <Tag
        color="blue"
        style={{
          fontSize: 11,
          lineHeight: "20px",
          padding: "0 8px",
          borderRadius: 4,
          marginBottom: 8,
        }}
        icon={<ReadOutlined />}
      >
        AI 推荐
      </Tag>

      {/* 标题 */}
      <Text
        strong
        style={{
          color: "#F1F5F9",
          fontSize: 16,
          lineHeight: "24px",
          display: "block",
          marginBottom: 6,
        }}
      >
        {title}
      </Text>

      {/* 内容摘要（最多 2 行截断） */}
      <Text
        style={{
          color: "#94A3B8",
          fontSize: 12,
          lineHeight: "18px",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          textOverflow: "ellipsis",
          marginBottom: 10,
        }}
      >
        {content}
      </Text>

      {/* "查看详情" 链接 */}
      <div>
        <Text
          onClick={handleClick}
          style={{
            color: url ? "#3B82F6" : "#475569",
            fontSize: 13,
            cursor: url ? "pointer" : "default",
            userSelect: "none",
            transition: "color 0.15s",
          }}
          onMouseEnter={(e) => {
            if (url) (e.currentTarget as HTMLElement).style.color = "#60A5FA";
          }}
          onMouseLeave={(e) => {
            if (url) (e.currentTarget as HTMLElement).style.color = "#3B82F6";
          }}
        >
          查看详情 {url && "→"}
        </Text>
      </div>
    </Card>
  );
};

export default KnowledgeCard;
