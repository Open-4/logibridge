/**
 * ControlTowerPage.tsx — 控制塔全屏监控页面
 *
 * 布局：全屏地图 + 底部可拖拽面板
 */

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import {
  Tabs,
  Timeline,
  Table,
  Tag,
  Badge,
  Card,
  Button,
  Space,
  Typography,
  Checkbox,
  Select,
  Radio,
  Popover,
  message,
  Spin,
  Tooltip,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  WarningOutlined,
  BellOutlined,
  CarOutlined,
  SafetyOutlined,
  AimOutlined,
  SwapOutlined,
  ExpandOutlined,
  CompressOutlined,
} from "@ant-design/icons";
import { Map as MapLibreMap, Popup, type MapRef } from "react-map-gl/maplibre";
import DeckGL from "@deck.gl/react";
import {
  ArcLayer,
  ScatterplotLayer,
  HeatmapLayer,
  IconLayer,
} from "@deck.gl/layers";
import "maplibre-gl/dist/maplibre-gl.css";
import dayjs from "dayjs";

import type {
  ShipmentItem,
  TrackingEventItem,
} from "../api/controlTowerApi";
import {
  fetchShipments,
  fetchShipmentEvents,
  fetchRiskEventsGeoJson,
  fetchShipmentRisk,
} from "../api/controlTowerApi";

const { Text, Title } = Typography;

// ── 常量 ──────────────────────────────────────────────────────────

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY as string;
const MAP_STYLE = MAPTILER_KEY
  ? `https://api.maptiler.com/maps/streets-v2-dark/tiles.json?key=${MAPTILER_KEY}`
  : "https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png";

const SEVERITY_COLOR: Record<string, string> = {
  critical: "#EF4444",
  high: "#F97316",
  medium: "#EAB308",
  low: "#3B82F6",
};

const SEVERITY_LABEL: Record<string, string> = {
  critical: "严重",
  high: "高",
  medium: "中",
  low: "低",
};

const TYPE_ICON: Record<string, string> = {
  strike: "⚠️",
  congestion: "⚓",
  typhoon: "🌀",
  security: "🔴",
};

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

// ── 组件 ──────────────────────────────────────────────────────────

const ControlTowerPage: React.FC = () => {
  const navigate = useNavigate();
  const mapRef = useRef<MapRef>(null);

  // 面板高度
  const [panelHeight, setPanelHeight] = useState(200);
  const [panelExpanded, setPanelExpanded] = useState(false);
  const dragRef = useRef(false);
  const dragStartY = useRef(0);
  const dragStartH = useRef(0);

  // 数据
  const [shipments, setShipments] = useState<ShipmentItem[]>([]);
  const [riskFeatures, setRiskFeatures] = useState<any[]>([]);
  const [shipmentsLoading, setShipmentsLoading] = useState(false);
  const [selectedBl, setSelectedBl] = useState<string | null>(null);
  const [selectedShipmentEvents, setSelectedShipmentEvents] = useState<
    TrackingEventItem[]
  >([]);
  const [hoveredRisk, setHoveredRisk] = useState<any>(null);

  // Popup
  const [popupInfo, setPopupInfo] = useState<{
    x: number;
    y: number;
    content: React.ReactNode;
  } | null>(null);

  // 加载数据
  useEffect(() => {
    loadShipments();
    loadRiskEvents();
  }, []);

  const loadShipments = async () => {
    setShipmentsLoading(true);
    try {
      const data = await fetchShipments();
      setShipments(data);
    } catch {
      message.error("加载货物列表失败");
    }
    setShipmentsLoading(false);
  };

  const loadRiskEvents = async () => {
    try {
      const geo = await fetchRiskEventsGeoJson();
      setRiskFeatures(geo.features ?? []);
    } catch {
      console.warn("加载风险事件地图数据失败");
    }
  };

  // ── 面板拖拽 ─────────────────────────────────────────────────

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      dragRef.current = true;
      dragStartY.current = e.clientY;
      dragStartH.current = panelHeight;
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [panelHeight],
  );

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragRef.current) return;
    const delta = dragStartY.current - e.clientY;
    const newH = Math.min(500, Math.max(120, dragStartH.current + delta));
    setPanelHeight(newH);
  }, []);

  const handleMouseUp = useCallback(() => {
    dragRef.current = false;
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  }, [handleMouseMove]);

  // ── 点击货物 ─────────────────────────────────────────────────

  const handleShipmentClick = async (bl: string, x: number, y: number) => {
    setSelectedBl(bl);
    try {
      const evResp = await fetchShipmentEvents(bl);
      setSelectedShipmentEvents(evResp.events);
    } catch {
      setSelectedShipmentEvents([]);
    }
    setPopupInfo({
      x,
      y,
      content: (
        <div style={{ minWidth: 200 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
            {bl}
          </div>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>
            {shipments.find((s) => s.bl_number === bl)?.cargo_desc ?? ""}
          </div>
          <Button size="small" type="primary" onClick={() => setPopupInfo(null)}>
            查看轨迹
          </Button>
        </div>
      ),
    });
  };

  // ── 飞往风险区域 ─────────────────────────────────────────────

  const flyTo = (lng: number, lat: number) => {
    mapRef.current?.flyTo({ center: [lng, lat], zoom: 4, duration: 1500 });
    setPanelExpanded(true);
    setPanelHeight(320);
  };

  // ── Deck.gl 图层 ────────────────────────────────────────────

  // 风险事件 Scatterplot
  const riskLayer = useMemo(() => {
    if (!riskFeatures.length) return null;
    const data = riskFeatures.map((f) => ({
      coordinates: f.geometry.coordinates,
      severity: f.properties.severity,
      type: f.properties.type,
      title: f.properties.title,
      radius: f.properties.radius_km * 1000,
      ...f.properties,
    }));

    return new ScatterplotLayer<any>({
      id: "risks",
      data,
      getPosition: (d) => d.coordinates,
      getFillColor: (d) => {
        const c = SEVERITY_COLOR[d.severity] || "#3B82F6";
        return [...hexToRgb(c), d.severity === "critical" ? 180 : 120];
      },
      getRadius: (d) => d.radius || 200000,
      radiusMinPixels: 20,
      radiusMaxPixels: 200,
      pickable: true,
      stroked: true,
      getLineColor: (d) => [...hexToRgb(SEVERITY_COLOR[d.severity] || "#3B82F6"), 220],
      lineWidthMinPixels: 2,
      onClick: (info) => {
        if (!info.object) return;
        setPopupInfo({
          x: info.x,
          y: info.y,
          content: (
            <div style={{ minWidth: 220 }}>
              <Space>
                <span>{TYPE_ICON[info.object.type] || "🔔"}</span>
                <span style={{ fontWeight: 600 }}>
                  {info.object.title}
                </span>
                <Tag color={SEVERITY_COLOR[info.object.severity]}>
                  {SEVERITY_LABEL[info.object.severity]}
                </Tag>
              </Space>
              <div style={{ fontSize: 12, color: "#666", margin: "6px 0" }}>
                {info.object.description?.slice(0, 120)}...
              </div>
              <Space>
                <Button
                  size="small"
                  type="primary"
                  onClick={() => {
                    flyTo(info.object.coordinates[0], info.object.coordinates[1]);
                    setPopupInfo(null);
                  }}
                >
                  查看影响
                </Button>
                <Button size="small" onClick={() => setPopupInfo(null)}>
                  关闭
                </Button>
              </Space>
            </div>
          ),
        });
      },
    });
  }, [riskFeatures]);

  // 在途货物 Scatterplot
  const shipmentLayer = useMemo(() => {
    if (!shipments.length) return null;
    // 从 ports.json 获取坐标
    const data = shipments.map((s) => ({
      bl: s.bl_number,
      status: s.status,
      origin: s.origin,
      destination: s.destination,
      eta: s.eta,
      cargo: s.cargo_desc,
      // 使用港口代码占位坐标 (实际应从 ports.json 加载)
      coordinates: getPortCoords(s.origin),
    }));

    return new ScatterplotLayer<any>({
      id: "shipments",
      data,
      getPosition: (d) => d.coordinates,
      getFillColor: (d) =>
        d.status === "delayed"
          ? [239, 68, 68, 200]
          : d.status === "customs_clearance"
            ? [251, 191, 36, 200]
            : d.status === "delivered"
              ? [16, 185, 129, 200]
              : [59, 130, 246, 200],
      getRadius: 40000,
      radiusMinPixels: 6,
      radiusMaxPixels: 14,
      pickable: true,
      stroked: true,
      getLineColor: [255, 255, 255, 150],
      lineWidthMinPixels: 1,
      onClick: (info) => {
        if (!info.object) return;
        handleShipmentClick(info.object.bl, info.x, info.y);
      },
    });
  }, [shipments]);

  // 航线弧线（选中货物时高亮）
  const highlightArcLayer = useMemo(() => {
    if (!selectedBl) return null;
    const s = shipments.find((s) => s.bl_number === selectedBl);
    if (!s) return null;
    return new ArcLayer({
      id: "highlight-route",
      data: [{ from: getPortCoords(s.origin), to: getPortCoords(s.destination) }],
      getSourcePosition: (d) => d.from,
      getTargetPosition: (d) => d.to,
      getSourceColor: [59, 130, 246, 220],
      getTargetColor: [59, 130, 246, 100],
      getWidth: 3,
      widthMinPixels: 2,
      widthMaxPixels: 6,
    });
  }, [selectedBl, shipments]);

  const layers = useMemo(
    () => [riskLayer, shipmentLayer, highlightArcLayer].filter(Boolean),
    [riskLayer, shipmentLayer, highlightArcLayer],
  );

  // ── 表格列 ─────────────────────────────────────────────────

  const columns: ColumnsType<ShipmentItem> = [
    {
      title: "提单号",
      dataIndex: "bl_number",
      key: "bl",
      width: 140,
      render: (v: string) => (
        <span style={{ color: "#CBD5E1", fontWeight: 600, fontSize: 12 }}>{v}</span>
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
      width: 140,
      render: (_: unknown, r: ShipmentItem) => (
        <span style={{ color: "#94A3B8", fontSize: 12 }}>
          {r.origin} → {r.destination}
        </span>
      ),
    },
    {
      title: "ETA",
      dataIndex: "eta",
      key: "eta",
      width: 120,
      render: (v: string) => (
        <span style={{ color: "#94A3B8", fontSize: 12 }}>
          {dayjs(v).format("MM/DD")}
        </span>
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
              onClick={() => setSelectedBl(r.bl_number)}
            />
          </Tooltip>
          <Tooltip title="设置预警">
            <Button size="small" icon={<BellOutlined />} />
          </Tooltip>
        </Space>
      ),
    },
  ];

  // ── 可展开行 ─────────────────────────────────────────────────

  const expandedRowRender = (record: ShipmentItem) => {
    return (
      <div style={{ padding: "8px 0" }}>
        <Text style={{ color: "#94A3B8", fontSize: 12 }}>
          {record.cargo_desc}
        </Text>
        <div style={{ marginTop: 8 }}>
          <Text style={{ color: "#64748B", fontSize: 11 }}>
            ETD: {dayjs(record.etd).format("YYYY-MM-DD")} | ETA:{" "}
            {dayjs(record.eta).format("YYYY-MM-DD")}
          </Text>
        </div>
      </div>
    );
  };

  // ═════════════════════════════════════════════════════════════
  //  RENDER
  // ═════════════════════════════════════════════════════════════

  return (
    <div style={{ height: "calc(100vh - 56px)", position: "relative", overflow: "hidden" }}>
      {/* ══ 地图 ══ */}
      <DeckGL
        layers={layers}
        initialViewState={{
          longitude: 60,
          latitude: 20,
          zoom: 2,
          pitch: 30,
          bearing: 0,
        }}
        controller={true}
        pickingRadius={5}
        getTooltip={({ object }: { object?: any }) => {
          if (!object) return null;
          return object.title
            ? `[${object.severity}] ${object.title}`
            : object.bl
              ? `${object.bl} — ${object.status}`
              : null;
        }}
      >
        <MapLibreMap
          ref={mapRef}
          mapStyle={MAP_STYLE}
          attributionControl={true}
          style={{ width: "100%", height: "100%" }}
        />
      </DeckGL>

      {/* ══ 左侧图例 ══ */}
      <Card
        size="small"
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          zIndex: 10,
          background: "rgba(15, 23, 42, 0.85)",
          borderColor: "#334155",
          minWidth: 160,
          backdropFilter: "blur(8px)",
        }}
      >
        <Space direction="vertical" size={8}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "#3B82F6",
              }}
            />
            <Text style={{ color: "#CBD5E1", fontSize: 12 }}>
              在途货物 ({shipments.filter((s) => s.status === "in_transit").length}票)
            </Text>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "#EF4444",
                opacity: 0.7,
              }}
            />
            <Text style={{ color: "#CBD5E1", fontSize: 12 }}>高风险区域</Text>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "#EAB308",
                opacity: 0.7,
              }}
            />
            <Text style={{ color: "#CBD5E1", fontSize: 12 }}>中风险区域</Text>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12 }}>⚓</span>
            <Text style={{ color: "#CBD5E1", fontSize: 12 }}>港口拥堵</Text>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12 }}>🌀</span>
            <Text style={{ color: "#CBD5E1", fontSize: 12 }}>台风/天气</Text>
          </div>
        </Space>
      </Card>

      {/* ══ Popup ══ */}
      {popupInfo &&
        createPortal(
          <div
            style={{
              position: "absolute",
              left: popupInfo.x + 12,
              top: popupInfo.y - 10,
              zIndex: 999,
              background: "#1E293B",
              border: "1px solid #334155",
              borderRadius: 8,
              padding: 12,
              boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
              pointerEvents: "auto",
              maxWidth: 280,
            }}
          >
            {popupInfo.content}
          </div>,
          document.body,
        )}

      {/* ══ 底部面板拖拽把手 ══ */}
      <div
        onMouseDown={handleMouseDown}
        style={{
          position: "absolute",
          bottom: panelHeight - 8,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 20,
          width: 48,
          height: 6,
          background: "#475569",
          borderRadius: 3,
          cursor: "ns-resize",
          opacity: 0.6,
        }}
      />

      {/* ══ 底部面板 ══ */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: panelHeight,
          zIndex: 15,
          background: "rgba(15, 23, 42, 0.92)",
          borderTop: "1px solid #334155",
          backdropFilter: "blur(12px)",
          display: "flex",
          flexDirection: "column",
          transition: panelExpanded ? "height 0.3s ease" : "none",
        }}
      >
        <Tabs
          defaultActiveKey="alerts"
          tabBarStyle={{
            margin: "0 16px",
            paddingTop: 8,
          }}
          tabBarExtraContent={
            <Button
              size="small"
              type="text"
              icon={panelHeight < 400 ? <ExpandOutlined /> : <CompressOutlined />}
              onClick={() => {
                const next = panelHeight < 400 ? 460 : 200;
                setPanelHeight(next);
                setPanelExpanded(next > 300);
              }}
              style={{ color: "#94A3B8" }}
            />
          }
          items={[
            // ════════════════════════════════════════════
            //  Tab 1: 实时预警
            // ════════════════════════════════════════════
            {
              key: "alerts",
              label: (
                <span style={{ color: "#F1F5F9" }}>
                  <BellOutlined /> 实时预警
                </span>
              ),
              children: (
                <div style={{ padding: "0 16px", overflow: "auto", height: panelHeight - 60 }}>
                  {riskFeatures.length === 0 ? (
                    <Text style={{ color: "#64748B" }}>暂无活跃预警</Text>
                  ) : (
                    <Timeline
                      items={riskFeatures.map((f) => ({
                        color: SEVERITY_COLOR[f.properties.severity] || "#3B82F6",
                        children: (
                          <div
                            style={{
                              marginBottom: 8,
                              borderLeft: `3px solid ${SEVERITY_COLOR[f.properties.severity] || "#3B82F6"}`,
                              paddingLeft: 12,
                            }}
                          >
                            <Space>
                              <span>
                                {TYPE_ICON[f.properties.type] || "🔔"}
                              </span>
                              <span style={{ color: "#F1F5F9", fontWeight: 600 }}>
                                {f.properties.title}
                              </span>
                              <Tag
                                color={
                                  SEVERITY_COLOR[f.properties.severity]
                                }
                              >
                                {SEVERITY_LABEL[f.properties.severity]}
                              </Tag>
                            </Space>
                            <div style={{ color: "#94A3B8", fontSize: 12, marginTop: 4 }}>
                              {f.properties.description?.slice(0, 120)}
                            </div>
                            <Space style={{ marginTop: 6, marginBottom: 4 }}>
                              <Button
                                size="small"
                                type="primary"
                                icon={<AimOutlined />}
                                onClick={() =>
                                  flyTo(
                                    f.geometry.coordinates[0],
                                    f.geometry.coordinates[1],
                                  )
                                }
                              >
                                查看影响
                              </Button>
                              <Button
                                size="small"
                                icon={<SafetyOutlined />}
                                onClick={() =>
                                  message.info(
                                    "货物筛选功能: 显示受此事件影响的在途货物",
                                  )
                                }
                              >
                                影响货物
                              </Button>
                              <Button
                                size="small"
                                icon={<SwapOutlined />}
                                onClick={() => {
                                  message.success("已预填绕过风险区域的参数，跳转至方案推演");
                                  navigate("/");
                                }}
                              >
                                生成备选方案
                              </Button>
                            </Space>
                          </div>
                        ),
                      }))}
                    />
                  )}
                </div>
              ),
            },

            // ════════════════════════════════════════════
            //  Tab 2: 我的货物
            // ════════════════════════════════════════════
            {
              key: "shipments",
              label: (
                <span style={{ color: "#F1F5F9" }}>
                  <CarOutlined /> 我的货物
                </span>
              ),
              children: (
                <div style={{ padding: "0 16px", overflow: "auto", height: panelHeight - 60 }}>
                  <Table
                    dataSource={shipments}
                    columns={columns}
                    rowKey="bl_number"
                    size="small"
                    loading={shipmentsLoading}
                    expandable={{
                      expandedRowRender,
                      expandRowByClick: true,
                    }}
                    onRow={(record) => ({
                      onClick: () => setSelectedBl(record.bl_number),
                      style: {
                        cursor: "pointer",
                        background:
                          selectedBl === record.bl_number
                            ? "rgba(59, 130, 246, 0.1)"
                            : undefined,
                      },
                    })}
                    pagination={false}
                    scroll={{ y: panelHeight - 130 }}
                    style={{ background: "transparent" }}
                  />
                </div>
              ),
            },

            // ════════════════════════════════════════════
            //  Tab 3: 风险订阅
            // ════════════════════════════════════════════
            {
              key: "subscribe",
              label: (
                <span style={{ color: "#F1F5F9" }}>
                  <SafetyOutlined /> 风险订阅
                </span>
              ),
              children: (
                <div
                  style={{
                    padding: "0 16px",
                    overflow: "auto",
                    height: panelHeight - 60,
                  }}
                >
                  <Space direction="vertical" size={16} style={{ width: "100%" }}>
                    <div>
                      <Text style={{ color: "#CBD5E1", display: "block", marginBottom: 8 }}>
                        关注的港口
                      </Text>
                      <Select
                        mode="multiple"
                        style={{ width: "100%" }}
                        placeholder="选择港口"
                        options={[
                          { value: "CNSHA", label: "上海港" },
                          { value: "CNNGB", label: "宁波舟山港" },
                          { value: "USLAX", label: "洛杉矶港" },
                          { value: "NLRTM", label: "鹿特丹港" },
                          { value: "SGSIN", label: "新加坡港" },
                          { value: "DEHAM", label: "汉堡港" },
                        ]}
                        onChange={(v) => message.info(`已关注 ${v.length} 个港口`)}
                      />
                    </div>

                    <div>
                      <Text style={{ color: "#CBD5E1", display: "block", marginBottom: 8 }}>
                        关注的航线
                      </Text>
                      <Checkbox.Group
                        options={[
                          { value: "东亚-北美西", label: "东亚→北美西" },
                          { value: "东亚-北美东", label: "东亚→北美东" },
                          { value: "东亚-欧洲", label: "东亚→欧洲" },
                          { value: "东亚-东南亚", label: "东亚→东南亚" },
                          { value: "东南亚-欧洲", label: "东南亚→欧洲" },
                        ]}
                        onChange={(v) => message.info(`已关注 ${v.length} 条航线`)}
                      />
                    </div>

                    <div>
                      <Text style={{ color: "#CBD5E1", display: "block", marginBottom: 8 }}>
                        关注的风险类型
                      </Text>
                      <Checkbox.Group
                        options={[
                          { value: "strike", label: "罢工" },
                          { value: "congestion", label: "港口拥堵" },
                          { value: "typhoon", label: "台风/恶劣天气" },
                          { value: "security", label: "地缘安全事件" },
                        ]}
                        onChange={(v) => message.info(`已关注 ${v.length} 类风险`)}
                      />
                    </div>

                    <div>
                      <Text style={{ color: "#CBD5E1", display: "block", marginBottom: 8 }}>
                        通知方式
                      </Text>
                      <Radio.Group
                        defaultValue="app"
                        onChange={(e) =>
                          message.info(
                            `通知方式已设为: ${e.target.value === "app" ? "App推送" : "邮件"}`,
                          )
                        }
                      >
                        <Radio value="app" style={{ color: "#CBD5E1" }}>
                          App 推送
                        </Radio>
                        <Radio value="email" style={{ color: "#CBD5E1" }}>
                          邮件通知
                        </Radio>
                      </Radio.Group>
                    </div>

                    <Button type="primary" onClick={() => message.success("订阅设置已保存")}>
                      保存订阅设置
                    </Button>
                  </Space>
                </div>
              ),
            },
          ]}
          style={{ flex: 1, display: "flex", flexDirection: "column" }}
        />
      </div>
    </div>
  );
};

// ── 工具函数 ──────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  return [
    parseInt(clean.substring(0, 2), 16),
    parseInt(clean.substring(2, 4), 16),
    parseInt(clean.substring(4, 6), 16),
  ];
}

/** 港口代码 → 坐标的简易映射（实际应从 ports.json 加载） */
function getPortCoords(code: string): [number, number] {
  const MAP: Record<string, [number, number]> = {
    CNSHA: [121.47, 31.23],
    CNSGH: [121.48, 31.23],
    CNNGB: [121.88, 29.88],
    CNXMN: [118.07, 24.46],
    CNYTN: [114.27, 22.58],
    CNTAO: [120.3, 36.07],
    CNTSN: [117.72, 38.98],
    CNSHK: [113.92, 22.48],
    USLAX: [-118.24, 33.74],
    USLGB: [-118.19, 33.76],
    USNYC: [-74.01, 40.71],
    USSEA: [-122.33, 47.6],
    NLRTM: [4.5, 51.9],
    DEHAM: [9.99, 53.55],
    SGSIN: [103.85, 1.28],
    KRPUS: [129.05, 35.13],
    AEFJR: [55.37, 25.12],
    THLCH: [100.88, 13.07],
    AUSYD: [151.2, -33.85],
    CAVAN: [-123.12, 49.28],
    JPYOK: [139.65, 35.45],
    TWTXG: [120.28, 22.62],
    VNHCM: [106.7, 10.77],
    COBAL: [-79.56, 8.95],
    ZACPT: [18.42, -33.9],
    EGPSD: [32.35, 31.22],
    HKHKG: [114.17, 22.32],
  };
  return MAP[code] || [0, 0];
}

export default ControlTowerPage;
