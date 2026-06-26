/**
 * ShipmentsPage.tsx — 在途货物追踪列表页
 *
 * 显示所有货物的追踪列表，支持状态筛选、提单号搜索、展开查看轨迹事件
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card,
  Table,
  Input,
  Select,
  Tag,
  Typography,
  Space,
  Badge,
  Button,
  Empty,
  Spin,
  Tooltip,
} from "antd";
import {
  SearchOutlined,
  SwapOutlined,
  BellOutlined,
  CarryOutOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import {
  fetchShipments,
  fetchShipmentEvents,
  type ShipmentItem,
  type TrackingEventItem,
} from "../api/controlTowerApi";

const { Text, Title } = Typography;

const STATUS_TAG_COLOR: Record<string, string> = {
  in_transit: "blue",
  customs_clearance: "orange",
  delayed: "red",
  delivered: "green",
};

const STATUS_LABEL: Record<string, string> = {
  in_transit: "在途",
  customs_clearance: "清关中",
  delayed: "延误",
  delivered: "已交付",
};

const ShipmentsPage: React.FC = () => {
  const navigate = useNavigate();
  const [shipments, setShipments] = useState<ShipmentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchShipments({
        status: statusFilter || undefined,
        search: search || undefined,
      });
      setShipments(data);
    } catch {
      setShipments([]);
    }
    setLoading(false);
  }, [statusFilter, search]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const columns: ColumnsType<ShipmentItem> = [
    {
      title: "提单号",
      dataIndex: "bl_number",
      key: "bl",
      width: 140,
      render: (v: string) => (
        <Text strong style={{ color: "#3B82F6", fontSize: 13, cursor: "pointer" }}
          onClick={() => navigate(`/control-tower?search=${v}`)}
        >
          {v}
        </Text>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 100,
      render: (v: string) => (
        <Tag color={STATUS_TAG_COLOR[v] || "default"}>{STATUS_LABEL[v] || v}</Tag>
      ),
    },
    {
      title: "路线",
      key: "route",
      width: 180,
      render: (_: unknown, r: ShipmentItem) => (
        <Text style={{ color: "#CBD5E1", fontSize: 13 }}>
          {r.origin} → {r.destination}
        </Text>
      ),
    },
    {
      title: "货物描述",
      dataIndex: "cargo_desc",
      key: "cargo",
      ellipsis: true,
      render: (v: string) => (
        <Text style={{ color: "#94A3B8", fontSize: 13 }}>{v}</Text>
      ),
    },
    {
      title: "预计到港",
      dataIndex: "eta",
      key: "eta",
      width: 120,
      render: (v: string) => (
        <Text style={{ color: "#94A3B8", fontSize: 13 }}>
          {dayjs(v).format("MM/DD")}
        </Text>
      ),
    },
    {
      title: "操作",
      key: "action",
      width: 120,
      render: (_: unknown, r: ShipmentItem) => (
        <Space size="small">
          <Tooltip title="查看轨迹">
            <Button
              size="small"
              icon={<SwapOutlined />}
              onClick={() => navigate(`/control-tower?search=${r.bl_number}`)}
            />
          </Tooltip>
          <Tooltip title="设置预警">
            <Button size="small" icon={<BellOutlined />} />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: "24px 48px" }}>
      {/* 顶部：标题 + 筛选 */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <Title level={3} style={{ color: "#F1F5F9", margin: 0 }}>
            在途货物
          </Title>
          <Text type="secondary" style={{ color: "#94A3B8", marginTop: 4 }}>
            追踪和管理您的国际物流货物
          </Text>
        </div>

        <Space>
          <Input
            prefix={<SearchOutlined style={{ color: "#64748B" }} />}
            placeholder="搜索提单号..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
            style={{
              width: 220,
              background: "#1E293B",
              border: "1px solid #334155",
              color: "#F1F5F9",
            }}
          />
          <Select
            allowClear
            placeholder="按状态筛选"
            value={statusFilter || undefined}
            onChange={(v) => setStatusFilter(v ?? "")}
            style={{ width: 130 }}
            options={[
              { value: "in_transit", label: "在途" },
              { value: "delayed", label: "延误" },
              { value: "customs_clearance", label: "清关中" },
              { value: "delivered", label: "已交付" },
            ]}
          />
        </Space>
      </div>

      {/* 表格 */}
      <Card
        style={{
          background: "#1E293B",
          borderColor: "#334155",
          borderRadius: 8,
        }}
      >
        <Table
          dataSource={shipments}
          columns={columns}
          rowKey="bl_number"
          loading={loading}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <Text style={{ color: "#64748B" }}>
                    {search || statusFilter ? "未找到匹配的货物" : "暂无在途货物"}
                  </Text>
                }
              />
            ),
          }}
          onRow={(record) => ({
            onClick: () => navigate(`/control-tower?search=${record.bl_number}`),
            style: { cursor: "pointer" },
          })}
        />
      </Card>
    </div>
  );
};

export default ShipmentsPage;
