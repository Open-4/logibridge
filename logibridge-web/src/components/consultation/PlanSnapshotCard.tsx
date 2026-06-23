/**
 * PlanSnapshotCard.tsx — 方案摘要卡片组件
 *
 * 在咨询对话中展示 AI 推荐或引用的物流方案概览。
 *
 * Props:
 *   plan — PlanResult 对象（来自 usePlanStore）
 */

import { useNavigate } from "react-router-dom";
import { Card, Tag, Typography, Space, Button, Divider } from "antd";
import {
  ClockCircleOutlined,
  RiseOutlined,
  SafetyOutlined,
  SwapOutlined,
} from "@ant-design/icons";
import type { PlanResult, PlanSegment } from "../../store/usePlanStore";

const { Text } = Typography;

// ── 运输模式映射 ──────────────────────────────────────────────────

const MODE_LABELS: Record<string, string> = {
  sea: "海运",
  rail: "铁路",
  air: "空运",
  road: "陆运",
};

const MODE_COLORS: Record<string, string> = {
  sea: "blue",
  rail: "green",
  air: "orange",
  road: "purple",
};

const RISK_LABELS: Record<string, string> = {
  low: "低风险",
  medium: "中风险",
  high: "高风险",
};

const RISK_COLORS: Record<string, string> = {
  low: "green",
  medium: "orange",
  high: "red",
};

// ── 子组件：路线简述 ─────────────────────────────────────────────

interface RouteBriefProps {
  segments: PlanSegment[];
}

const RouteBrief: React.FC<RouteBriefProps> = ({ segments }) => {
  if (!segments || segments.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 4,
        marginTop: 4,
      }}
    >
      {segments.map((seg, idx) => (
        <span key={idx} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          {/* 箭头连接 */}
          {idx > 0 && (
            <Text style={{ color: "#475569", fontSize: 13, margin: "0 2px" }}>
              →
            </Text>
          )}
          {/* 港口代码 */}
          <Text style={{ color: "#CBD5E1", fontSize: 12, fontWeight: 500 }}>
            {seg.from}
          </Text>
          {/* 运输模式标签 */}
          <Tag
            color={MODE_COLORS[seg.transportMode] || "default"}
            style={{
              fontSize: 10,
              lineHeight: "16px",
              padding: "0 4px",
              margin: 0,
            }}
          >
            {MODE_LABELS[seg.transportMode] || seg.transportMode}
          </Tag>
          <Text style={{ color: "#64748B", fontSize: 11 }}>
            {seg.to}
          </Text>
        </span>
      ))}
    </div>
  );
};

// ── 主组件 ────────────────────────────────────────────────────────

interface PlanSnapshotCardProps {
  plan: PlanResult;
}

const PlanSnapshotCard: React.FC<PlanSnapshotCardProps> = ({ plan }) => {
  const navigate = useNavigate();

  const handleViewFull = () => {
    // 跳转到 SmartPlanPage，并携带方案 ID 作为 query param
    navigate(`/?plan=${encodeURIComponent(plan.id)}`);
  };

  // 路线起点和终点
  const firstSeg = plan.segments?.[0];
  const lastSeg = plan.segments?.[plan.segments.length - 1];
  const routeLabel =
    firstSeg && lastSeg
      ? `${firstSeg.from} → ${lastSeg.to}`
      : plan.label || "未指定路线";

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
        body: { padding: "14px 16px" },
      }}
    >
      {/* 第一行：方案类型标签 + 风险 */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
        }}
      >
        <Tag
          color="geekblue"
          style={{
            fontSize: 11,
            lineHeight: "20px",
            padding: "0 8px",
            borderRadius: 4,
          }}
          icon={<SwapOutlined />}
        >
          {plan.label || "物流方案"}
        </Tag>
        <Tag
          color={RISK_COLORS[plan.riskLevel] || "default"}
          icon={<SafetyOutlined />}
          style={{ fontSize: 11, lineHeight: "20px", padding: "0 8px" }}
        >
          {RISK_LABELS[plan.riskLevel] || plan.riskLevel}
        </Tag>
      </div>

      {/* 路线简述 */}
      <RouteBrief segments={plan.segments} />

      {/* 分隔线 */}
      <Divider style={{ margin: "10px 0", borderColor: "#1E293B" }} />

      {/* 费用 + 耗时 */}
      <div style={{ display: "flex", gap: 24, marginBottom: 12 }}>
        <div>
          <Text style={{ color: "#64748B", fontSize: 11, display: "block" }}>
            总费用
          </Text>
          <Text
            strong
            style={{
              color: "#3B82F6",
              fontSize: 22,
              lineHeight: "28px",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            ${plan.totalFreight.toLocaleString()}
          </Text>
        </div>
        <div>
          <Text style={{ color: "#64748B", fontSize: 11, display: "block" }}>
            预计耗时
          </Text>
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
            <ClockCircleOutlined style={{ color: "#94A3B8", fontSize: 14 }} />
            <Text
              strong
              style={{
                color: "#F1F5F9",
                fontSize: 18,
                lineHeight: "24px",
              }}
            >
              {plan.totalDays}
            </Text>
            <Text style={{ color: "#94A3B8", fontSize: 13 }}>天</Text>
          </div>
        </div>
      </div>

      {/* 碳排放（如有） */}
      {plan.carbonEmission > 0 && (
        <div style={{ marginBottom: 10 }}>
          <Text style={{ color: "#64748B", fontSize: 11, display: "block" }}>
            碳排放
          </Text>
          <Text style={{ color: "#CBD5E1", fontSize: 13 }}>
            {plan.carbonEmission.toLocaleString()} kg CO₂
          </Text>
        </div>
      )}

      {/* "查看完整方案" 按钮 */}
      <Button
        type="primary"
        block
        size="small"
        ghost
        onClick={handleViewFull}
        style={{
          borderRadius: 6,
          fontSize: 13,
          height: 34,
        }}
      >
        查看完整方案 →
      </Button>
    </Card>
  );
};

export default PlanSnapshotCard;
