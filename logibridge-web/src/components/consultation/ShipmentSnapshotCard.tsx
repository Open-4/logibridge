/**
 * ShipmentSnapshotCard.tsx — 货物摘要卡片组件
 *
 * 在咨询对话中展示 AI 关联的货物信息概览。
 *
 * Props:
 *   shipment — ShipmentItem 对象（来自 controlTowerApi）
 */

import { useNavigate } from "react-router-dom";
import { Card, Tag, Typography, Button } from "antd";
import {
  CarryOutOutlined,
  ArrowRightOutlined,
  ClockCircleOutlined,
  EnvironmentOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import type { ShipmentItem } from "../../api/controlTowerApi";

const { Text } = Typography;

// ── 状态映射 ──────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  in_transit: "运输中",
  customs_clearance: "清关中",
  delayed: "延误",
  delivered: "已交付",
};

const STATUS_COLORS: Record<string, string> = {
  in_transit: "blue",
  customs_clearance: "orange",
  delayed: "red",
  delivered: "green",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  in_transit: <CarryOutOutlined />,
  customs_clearance: <ClockCircleOutlined />,
  delayed: <ClockCircleOutlined />,
  delivered: <CarryOutOutlined />,
};

// ── 主组件 ────────────────────────────────────────────────────────

interface ShipmentSnapshotCardProps {
  shipment: ShipmentItem;
}

const ShipmentSnapshotCard: React.FC<ShipmentSnapshotCardProps> = ({
  shipment,
}) => {
  const navigate = useNavigate();

  const handleViewTrajectory = () => {
    // 跳转到 ControlTowerPage 并搜索该货物
    navigate(
      `/control-tower?search=${encodeURIComponent(shipment.bl_number)}`,
    );
  };

  const statusLabel =
    STATUS_LABELS[shipment.status] || shipment.status || "未知";
  const statusColor = STATUS_COLORS[shipment.status] || "default";
  const statusIcon = STATUS_ICONS[shipment.status];

  const formattedEta = shipment.eta
    ? dayjs(shipment.eta).format("YYYY-MM-DD")
    : "—";
  const formattedEtd = shipment.etd
    ? dayjs(shipment.etd).format("YYYY-MM-DD")
    : "—";

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
      {/* 第一行：提单号 + 状态 Tag */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <Text
          strong
          style={{
            color: "#3B82F6",
            fontSize: 14,
            fontFamily: "monospace",
            letterSpacing: "0.5px",
          }}
        >
          {shipment.bl_number}
        </Text>
        <Tag
          color={statusColor}
          icon={statusIcon}
          style={{
            fontSize: 11,
            lineHeight: "20px",
            padding: "0 8px",
            borderRadius: 4,
            flexShrink: 0,
          }}
        >
          {statusLabel}
        </Tag>
      </div>

      {/* 货物描述 */}
      {shipment.cargo_desc && (
        <Text
          style={{
            color: "#CBD5E1",
            fontSize: 13,
            display: "block",
            marginBottom: 10,
          }}
        >
          {shipment.cargo_desc}
        </Text>
      )}

      {/* 航线：起运港 → 目的港 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 10,
          padding: "8px 10px",
          background: "#1E293B",
          borderRadius: 6,
        }}
      >
        <EnvironmentOutlined style={{ color: "#3B82F6", fontSize: 13 }} />
        <Text
          strong
          style={{
            color: "#F1F5F9",
            fontSize: 14,
            fontFamily: "monospace",
          }}
        >
          {shipment.origin}
        </Text>
        <ArrowRightOutlined style={{ color: "#475569", fontSize: 12 }} />
        <Text
          strong
          style={{
            color: "#F1F5F9",
            fontSize: 14,
            fontFamily: "monospace",
          }}
        >
          {shipment.destination}
        </Text>
      </div>

      {/* ETA */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 16 }}>
          <div>
            <Text style={{ color: "#64748B", fontSize: 11, display: "block" }}>
              预计开航
            </Text>
            <Text style={{ color: "#CBD5E1", fontSize: 13 }}>
              {formattedEtd}
            </Text>
          </div>
          <div>
            <Text style={{ color: "#64748B", fontSize: 11, display: "block" }}>
              预计到港
            </Text>
            <Text
              style={{
                color: formattedEta !== "—" ? "#F1F5F9" : "#64748B",
                fontSize: 13,
              }}
            >
              {formattedEta}
            </Text>
          </div>
        </div>
      </div>

      {/* "查看轨迹" 按钮 */}
      <Button
        type="primary"
        block
        size="small"
        ghost
        icon={<CarryOutOutlined />}
        onClick={handleViewTrajectory}
        style={{
          borderRadius: 6,
          fontSize: 13,
          height: 34,
        }}
      >
        查看轨迹
      </Button>
    </Card>
  );
};

export default ShipmentSnapshotCard;
