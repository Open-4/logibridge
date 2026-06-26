/**
 * ControlTowerPage.tsx — 控制塔全屏监控页面
 *
 * 布局：全屏地图 + 底部可拖拽面板
 * 地图层：GeoJsonLayer（风险事件）+ ScatterplotLayer（在途货物 / 高亮受影响的货物）
 */

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
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
  DatePicker,
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
  ReloadOutlined,
} from "@ant-design/icons";
import { Map as MapLibreMap, Popup, Marker, type MapRef } from "react-map-gl/maplibre";
import DeckGL from "@deck.gl/react";
import {
  ArcLayer,
  ScatterplotLayer,
  GeoJsonLayer,
  IconLayer,
} from "@deck.gl/layers";
import { useQuery } from "@tanstack/react-query";
import "maplibre-gl/dist/maplibre-gl.css";
import dayjs from "dayjs";

import type {
  ShipmentItem,
  TrackingEventItem,
} from "../api/controlTowerApi";
import {
  fetchShipmentEvents,
  fetchRiskEvents,
  fetchShipmentRisk,
} from "../api/controlTowerApi";
import { useControlTowerStore, getPortCoords } from "../store/useControlTowerStore";

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
const SEVERITY_FILL: Record<string, [number, number, number, number]> = {
  critical: [239, 68, 68, 200],
  high: [239, 68, 68, 180],
  medium: [234, 179, 8, 160],
  low: [59, 130, 246, 140],
};
const SEVERITY_LINE: Record<string, [number, number, number, number]> = {
  critical: [239, 68, 68, 240],
  high: [239, 68, 68, 220],
  medium: [234, 179, 8, 200],
  low: [59, 130, 246, 180],
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
  // ── 全局 CSS 动画（仅注入一次） ──────────────────────────
  useEffect(() => {
    const id = "control-tower-anim";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `
      @keyframes pulse-ring {
        0%   { transform: scale(1); opacity: 0.7; }
        50%  { transform: scale(2.5); opacity: 0.3; }
        100% { transform: scale(4); opacity: 0; }
      }
      @keyframes pulse-ring-inner {
        0%   { transform: scale(1); opacity: 0.5; }
        50%  { transform: scale(1.5); opacity: 0.8; }
        100% { transform: scale(1); opacity: 0.5; }
      }
      @keyframes blink-delayed {
        0%, 100% { opacity: 1; }
        50%      { opacity: 0.2; }
      }
      .risk-marker-pulse {
        width: 12px; height: 12px;
        border-radius: 50%;
        position: relative;
      }
      .risk-marker-pulse::before {
        content: '';
        position: absolute;
        inset: -8px;
        border-radius: 50%;
        border: 2px solid currentColor;
        animation: pulse-ring 2s ease-out infinite;
      }
      .risk-marker-pulse::after {
        content: '';
        position: absolute;
        inset: -4px;
        border-radius: 50%;
        border: 1px solid currentColor;
        animation: pulse-ring-inner 2s ease-out infinite 0.5s;
      }
      .marker-delayed {
        width: 14px; height: 14px;
        border-radius: 50%;
        background: #EF4444;
        border: 2px solid #fff;
        animation: blink-delayed 1.2s ease-in-out infinite;
        box-shadow: 0 0 6px rgba(239,68,68,0.6);
      }
    `;
    document.head.appendChild(style);
  }, []);
  // ── Store ──────────────────────────────────────────────
  const {
    riskEvents,
    shipments,
    selectedEvent,
    selectedShipment,
    affectedShipments,
    loading,
    fetchRiskEvents: storeFetchRiskEvents,
    fetchShipments: storeFetchShipments,
    selectEvent,
    selectShipment,
  } = useControlTowerStore();

  // 面板
  const [panelHeight, setPanelHeight] = useState(200);
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState("alerts");
  const [highlightedRiskId, setHighlightedRiskId] = useState<string | null>(null);
  const [filterInTab2, setFilterInTab2] = useState(false);
  const dragRef = useRef(false);
  const dragStartY = useRef(0);
  const dragStartH = useRef(0);

  // 数据
  const [riskFeatures, setRiskFeatures] = useState<any[]>([]);
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

  // ── 时间范围过滤器 ─────────────────────────────────────────
  const [dateRange, setDateRange] = useState<[Date, Date]>([
    new Date(),
    new Date(Date.now() + 7 * 24 * 60 * 60_000),
  ]);

  // 根据时间范围过滤风险事件
  const filteredRiskFeatures = useMemo(() => {
    if (!riskFeatures.length) return [];
    const [start, end] = dateRange;
    return riskFeatures.filter((f) => {
      const evStart = new Date(f.properties.start_date);
      const evEnd = new Date(f.properties.end_date);
      // 事件时间窗口与筛选时间窗口有交集
      return evStart <= end && evEnd >= start;
    });
  }, [riskFeatures, dateRange]);

  // 地图联动已通过 filteredRiskFeatures 实现
  // (useEffect removed — store 中的 riskEvents 保持不变，地图数据使用 filteredRiskFeatures)

  // ── 轮询 & 最后更新时间 ──────────────────────────────────────
  const [lastLoaded, setLastLoaded] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 加载风险事件
  const loadRiskEvents = useCallback(async () => {
    try {
      const geo = await fetchRiskEvents();
      setRiskFeatures(geo.features ?? []);
    } catch {
      console.warn("加载风险事件地图数据失败");
    }
  }, []);

  // 统一刷新全部数据
  const refreshAll = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([storeFetchShipments(), storeFetchRiskEvents(), loadRiskEvents()]);
      setLastLoaded(new Date());
    } catch {
      console.warn("刷新失败");
    }
    setIsRefreshing(false);
  }, [storeFetchShipments, storeFetchRiskEvents, loadRiskEvents]);

  // 初始加载
  useEffect(() => {
    refreshAll();
  }, []);

  // 风险事件每 5 分钟轮询
  useEffect(() => {
    const id = setInterval(() => {
      storeFetchRiskEvents();
      loadRiskEvents();
    }, 5 * 60_000);
    return () => clearInterval(id);
  }, [storeFetchRiskEvents, loadRiskEvents]);

  // 在途货物每 10 分钟轮询
  useEffect(() => {
    const id = setInterval(() => {
      storeFetchShipments();
    }, 10 * 60_000);
    return () => clearInterval(id);
  }, [storeFetchShipments]);

  // 台风事件每 30 分钟刷新（通过 riskEvents 接口）
  useEffect(() => {
    const hasTyphoon = riskEvents.some((e) => e.type === "typhoon");
    if (!hasTyphoon) return;
    const id = setInterval(() => {
      loadRiskEvents();
    }, 30 * 60_000);
    return () => clearInterval(id);
  }, [riskEvents, loadRiskEvents]);

  // 联动 4: 当 affectedShipments 变化时切换到 Tab2
  useEffect(() => {
    if (filterInTab2 && affectedShipments.length > 0) {
      setActiveTab("shipments");
      setPanelHeight(Math.max(panelHeight, 300));
    }
  }, [filterInTab2, affectedShipments, panelHeight]);

  // ── 联动 1: 点击风险 → Tab1 高亮 ──────────────────────────

  const handleRiskClick = (feature: any, x: number, y: number) => {
    // 选中 Store
    selectEvent({
      id: feature.properties.id,
      type: feature.properties.type,
      severity: feature.properties.severity,
      title: feature.properties.title,
      description: feature.properties.description,
      radius_km: feature.properties.radius_km,
      start_date: feature.properties.start_date,
      end_date: feature.properties.end_date,
      source: feature.properties.source,
      coordinates: feature.geometry.coordinates,
      affected_ports: feature.properties.affected_ports,
      affected_routes: feature.properties.affected_routes,
    });

    // 切换到 Tab1 并高亮
    setActiveTab("alerts");
    setHighlightedRiskId(feature.properties.id);
    setPanelHeight(Math.max(panelHeight, 280));

    setPopupInfo({
      x,
      y,
      content: (
        <div style={{ minWidth: 220 }}>
          <Space>
            <span>{TYPE_ICON[feature.properties.type] || "🔔"}</span>
            <span style={{ fontWeight: 600 }}>
              {feature.properties.title}
            </span>
            <Tag color={SEVERITY_COLOR[feature.properties.severity]}>
              {SEVERITY_LABEL[feature.properties.severity]}
            </Tag>
          </Space>
          <div style={{ fontSize: 12, color: "#666", margin: "6px 0" }}>
            {feature.properties.description?.slice(0, 120)}...
          </div>
          <Space>
            <Button
              size="small"
              type="primary"
              onClick={() => {
                flyTo(feature.geometry.coordinates[0], feature.geometry.coordinates[1]);
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
  };

  // ── 联动 2: 查看影响 ─────────────────────────────────────

  const handleViewImpact = () => {
    setFilterInTab2(true);
    setActiveTab("shipments");
    setPanelHeight(Math.max(panelHeight, 300));
  };

  // ── 联动 3: 点击货物行 → 飞往 → 弧线 ─────────────────────

  const handleShipmentRowClick = (bl: string) => {
    const s = shipments.find((s) => s.bl_number === bl);
    if (!s) return;
    selectShipment(s as any);
    const coords = getPortCoords(s.origin);
    if (coords[0] !== 0 || coords[1] !== 0) {
      flyTo(coords[0], coords[1]);
    }
  };

  // ── 联动 4: 生成备选方案 → 跳转 SmartPlan ────────────────

  const handleGenerateAlternative = () => {
    if (!selectedEvent) return;
    // 从受影响货物推断起运港和目的港
    const firstAffected = affectedShipments[0];
    if (firstAffected) {
      const params = new URLSearchParams({
        origin: firstAffected.origin,
        destination: firstAffected.destination,
        avoid: selectedEvent.coordinates.join(","),
        riskType: selectedEvent.type,
      });
      navigate(`/?${params.toString()}`);
    } else {
      navigate("/");
    }
  };

  // ── 面板拖拽（react-draggable 风格的自定义实现） ──────────

  const panelMinH = 150;
  const panelMaxH = 500;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      dragRef.current = true;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
      dragStartY.current = clientY;
      dragStartH.current = panelHeight;
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.addEventListener("touchmove", handleTouchMove, { passive: false });
      document.addEventListener("touchend", handleTouchEnd);
    },
    [panelHeight],
  );

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragRef.current) return;
    const delta = dragStartY.current - e.clientY;
    const newH = Math.min(panelMaxH, Math.max(panelMinH, dragStartH.current + delta));
    setPanelHeight(newH);
    setPanelExpanded(newH > 300);
  }, []);

  const handleMouseUp = useCallback(() => {
    dragRef.current = false;
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
    // 将最终高度写入 store
    const state = useControlTowerStore.getState();
    if (state.setPanelHeight) state.setPanelHeight(panelHeight);
  }, [handleMouseMove, panelHeight]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!dragRef.current) return;
    e.preventDefault();
    const delta = dragStartY.current - e.touches[0].clientY;
    const newH = Math.min(panelMaxH, Math.max(panelMinH, dragStartH.current + delta));
    setPanelHeight(newH);
    setPanelExpanded(newH > 300);
  }, []);

  const handleTouchEnd = useCallback(() => {
    dragRef.current = false;
    document.removeEventListener("touchmove", handleTouchMove);
    document.removeEventListener("touchend", handleTouchEnd);
    const state = useControlTowerStore.getState();
    if (state.setPanelHeight) state.setPanelHeight(panelHeight);
  }, [handleTouchMove, panelHeight]);

  // ── 点击货物 ─────────────────────────────────────────────────

  const handleShipmentClick = async (bl: string, x: number, y: number) => {
    const s = shipments.find((s) => s.bl_number === bl);
    if (s) selectShipment(s);
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

  // 获取当前缩放级别
  const [viewState, setViewState] = useState({ zoom: 2 });
  const isLowZoom = viewState.zoom < 3;

  // 风险事件 GeoJsonLayer — 低缩放时隐藏详情，只显示聚合圆
  const riskLayer = useMemo(() => {
    if (!riskEvents.length && !riskFeatures.length) return null;
    const [rangeStart, rangeEnd] = dateRange;
    const filteredFeatures = riskFeatures.filter((f: any) => {
      const evStart = new Date(f.properties.start_date);
      const evEnd = new Date(f.properties.end_date);
      return evStart <= rangeEnd && evEnd >= rangeStart;
    });
    const filteredEvents = riskEvents.filter((e) => {
      const evStart = new Date(e.start_date);
      const evEnd = new Date(e.end_date);
      return evStart <= rangeEnd && evEnd >= rangeStart;
    });
    const data = filteredEvents.length > 0
      ? {
          type: "FeatureCollection" as const,
          features: filteredEvents.map((e) => ({
            type: "Feature" as const,
            properties: { ...e, id: e.id, severity: e.severity, radius_km: e.radius_km, title: e.title, type: e.type, description: e.description },
            geometry: { type: "Point" as const, coordinates: e.coordinates },
          })),
        }
      : { type: "FeatureCollection" as const, features: filteredFeatures };

    return new GeoJsonLayer<any>({
      id: "risk-events",
      data,
      pointRadiusMinPixels: isLowZoom ? 4 : 6,
      pointRadiusMaxPixels: isLowZoom ? 30 : 80,
      getPointRadius: (f) => isLowZoom ? 15 : (f.properties.radius_km || 200) * 1000,
      getFillColor: (d) => {
        const severity = d.properties.severity;
        return SEVERITY_FILL[severity] || [59, 130, 246, isLowZoom ? 80 : 120];
      },
      getLineColor: (d) => {
        const severity = d.properties.severity;
        return SEVERITY_LINE[severity] || [59, 130, 246, isLowZoom ? 120 : 160];
      },
      lineWidthMinPixels: isLowZoom ? 0.5 : 1.5,
      stroked: !isLowZoom,
      pickable: !isLowZoom,
      onClick: (info) => {
        if (!info.object) return;
        const props = info.object.properties;
        const matched = riskEvents.find((e) => e.id === props.id);
        if (matched) selectEvent(matched);
        setPopupInfo({
          x: info.x,
          y: info.y,
          content: (
            <div style={{ minWidth: 220 }}>
              <Space>
                <span>{TYPE_ICON[props.type] || "🔔"}</span>
                <span style={{ fontWeight: 600 }}>
                  {props.title}
                </span>
                <Tag color={SEVERITY_COLOR[props.severity]}>
                  {SEVERITY_LABEL[props.severity]}
                </Tag>
              </Space>
              <div style={{ fontSize: 12, color: "#666", margin: "6px 0" }}>
                {props.description?.slice(0, 120)}...
              </div>
              <Space>
                <Button
                  size="small"
                  type="primary"
                  onClick={() => {
                    const coords = info.object.geometry.coordinates;
                    flyTo(coords[0], coords[1]);
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
  }, [riskEvents, riskFeatures]);

  // 在途货物 Scatterplot（联动2: 受影响高亮）
  const affectedBls = useMemo(
    () => new Set(affectedShipments.map((a) => a.bl_number)),
    [affectedShipments],
  );

  const shipmentLayer = useMemo(() => {
    if (!shipments.length) return null;

    const data = shipments.map((s) => ({
      bl: s.bl_number,
      status: s.status,
      origin: s.origin,
      destination: s.destination,
      eta: s.eta,
      cargo: s.cargo_desc,
      coordinates: getPortCoords(s.origin),
      affected: affectedBls.has(s.bl_number),
    }));

    return new ScatterplotLayer<any>({
      id: "shipments",
      data,
      getPosition: (d) => d.coordinates,
      getFillColor: (d) => {
        if (d.affected) {
          if (d.status === "delayed") return [255, 80, 80, 255];
          if (d.status === "delivered") return [52, 211, 153, 255];
          return [96, 165, 250, 255];
        }
        if (d.status === "delayed") return [239, 68, 68, 200];
        if (d.status === "customs_clearance") return [251, 191, 36, 200];
        if (d.status === "delivered") return [16, 185, 129, 200];
        return [59, 130, 246, 200];
      },
      getRadius: (d) => (d.affected ? 65000 : 40000),
      radiusMinPixels: (d) => (d.affected ? 10 : 4),
      radiusMaxPixels: (d) => (d.affected ? 24 : 14),
      pickable: true,
      stroked: true,
      getLineColor: (d) => d.affected ? [255, 255, 255, 220] : [255, 255, 255, 120],
      lineWidthMinPixels: (d) => d.affected ? 2 : 1,
      onClick: (info) => {
        if (!info.object) return;
        handleShipmentClick(info.object.bl, info.x, info.y);
      },
    });
  }, [shipments, affectedShipments]);

  // 高亮弧线
  const highlightArcLayer = useMemo(() => {
    if (!selectedShipment) return null;
    const s = selectedShipment;
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
  }, [selectedShipment]);

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
              onClick={() => selectShipment(r)}
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
        onViewStateChange={({ viewState: vs }: { viewState: any }) =>
          setViewState({ zoom: vs.zoom })
        }
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

      {/* ══ CSS 动画 Marker 层（高风险 / 延误货物） ══ */}
      {riskEvents
        .filter((e) => e.severity === "high" || e.severity === "critical")
        .map((e) => (
          <Marker
            key={`risk-${e.id}`}
            longitude={e.coordinates[0]}
            latitude={e.coordinates[1]}
            anchor="center"
            onClick={() => {
              // 触发 handleRiskClick 类似的逻辑
              setActiveTab("alerts");
              setHighlightedRiskId(e.id);
              flyTo(e.coordinates[0], e.coordinates[1]);
            }}
          >
            <div
              className="risk-marker-pulse"
              style={{
                color: e.severity === "critical" ? "#EF4444" : "#F97316",
                cursor: "pointer",
              }}
              title={e.title}
            />
          </Marker>
        ))}

      {/* 延误货物闪烁标记 */}
      {shipments
        .filter((s) => s.status === "delayed")
        .map((s) => (
          <Marker
            key={`delay-${s.bl_number}`}
            longitude={getPortCoords(s.origin)[0]}
            latitude={getPortCoords(s.origin)[1]}
            anchor="center"
          >
            <div className="marker-delayed" title={`${s.bl_number} (延误)`} />
          </Marker>
        ))}

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

        {/* ── 最后更新时间 + 手动刷新 ── */}
        <div
          style={{
            borderTop: "1px solid #334155",
            marginTop: 8,
            paddingTop: 6,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <Text style={{ color: "#64748B", fontSize: 10 }}>
            {lastLoaded
              ? `更新: ${lastLoaded.toLocaleTimeString("zh-CN", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}`
              : "加载中..."}
          </Text>
          <Button
            size="small"
            type="text"
            icon={<ReloadOutlined spin={isRefreshing} />}
            loading={isRefreshing}
            onClick={refreshAll}
            style={{ color: "#94A3B8", fontSize: 11, padding: 0, height: "auto" }}
          >
            刷新
          </Button>
        </div>
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

      {/* ══ 底部面板拖拽把手（支持 mouse + touch） ══ */}
      <div
        onMouseDown={handleMouseDown}
        onTouchStart={handleMouseDown}
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

      {/* ══ 底部面板（framer-motion spring 动画） ══ */}
      <motion.div
        animate={{ height: panelHeight }}
        transition={{
          type: "spring",
          stiffness: 260,
          damping: 30,
          mass: 1,
        }}
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 15,
          background: "rgba(15, 23, 42, 0.92)",
          borderTop: "1px solid #334155",
          backdropFilter: "blur(12px)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key)}
          tabBarStyle={{
            margin: "0 16px",
            paddingTop: 8,
          }}
          tabBarExtraContent={
            <Space>
              <DatePicker.RangePicker
                size="small"
                value={[dayjs(dateRange[0]), dayjs(dateRange[1])]}
                onChange={(dates) => {
                  if (dates && dates[0] && dates[1]) {
                    setDateRange([dates[0].toDate(), dates[1].toDate()]);
                  }
                }}
                allowClear={false}
                style={{ background: "#0F172A", borderColor: "#334155" }}
              />
              <Button
                size="small"
                type="text"
                icon={panelHeight < 300 ? <ExpandOutlined /> : <CompressOutlined />}
                onClick={() => {
                  const next = panelHeight < 300 ? 460 : panelMinH;
                  setPanelHeight(next);
                  setPanelExpanded(next > 300);
                }}
                style={{ color: "#94A3B8" }}
              />
            </Space>
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
              children: activeTab === "alerts" ? (
                <div style={{ padding: "0 16px", overflow: "auto", height: panelHeight - 60 }}>
                  {filteredRiskFeatures.length === 0 ? (
                    <Text style={{ color: "#64748B" }}>暂无活跃预警</Text>
                  ) : (
                    <Timeline
                      items={filteredRiskFeatures.map((f) => ({
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
                                onClick={() => {
                                  selectEvent({
                                    id: f.properties.id,
                                    type: f.properties.type,
                                    severity: f.properties.severity,
                                    title: f.properties.title,
                                    description: f.properties.description,
                                    radius_km: f.properties.radius_km,
                                    start_date: f.properties.start_date,
                                    end_date: f.properties.end_date,
                                    source: f.properties.source,
                                    coordinates: f.geometry.coordinates,
                                  });
                                  flyTo(f.geometry.coordinates[0], f.geometry.coordinates[1]);
                                }}
                              >
                                查看影响
                              </Button>
                              <Button
                                size="small"
                                icon={<SafetyOutlined />}
                                onClick={() => {
                                  selectEvent({
                                    id: f.properties.id,
                                    type: f.properties.type,
                                    severity: f.properties.severity,
                                    title: f.properties.title,
                                    description: f.properties.description,
                                    radius_km: f.properties.radius_km,
                                    start_date: f.properties.start_date,
                                    end_date: f.properties.end_date,
                                    source: f.properties.source,
                                    coordinates: f.geometry.coordinates,
                                  });
                                  handleViewImpact();
                                }}
                              >
                                影响货物
                              </Button>
                              <Button
                                size="small"
                                icon={<SwapOutlined />}
                                onClick={() => {
                                  selectEvent({
                                    id: f.properties.id,
                                    type: f.properties.type,
                                    severity: f.properties.severity,
                                    title: f.properties.title,
                                    description: f.properties.description,
                                    radius_km: f.properties.radius_km,
                                    start_date: f.properties.start_date,
                                    end_date: f.properties.end_date,
                                    source: f.properties.source,
                                    coordinates: f.geometry.coordinates,
                                  });
                                  handleGenerateAlternative();
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
              ) : null,
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
              children: activeTab === "shipments" ? (
                <div style={{ padding: "0 16px", overflow: "auto", height: panelHeight - 60 }}>
                  <Table
                    dataSource={shipments}
                    columns={columns}
                    rowKey="bl_number"
                    size="small"
                    loading={loading}
                    expandable={{
                      expandedRowRender,
                      expandRowByClick: true,
                    }}
                    onRow={(record) => ({
                      onClick: () => handleShipmentRowClick(record.bl_number),
                      style: {
                        cursor: "pointer",
                        background: selectedShipment?.bl_number === record.bl_number
                          ? "rgba(59, 130, 246, 0.1)"
                          : affectedBls.has(record.bl_number)
                            ? "rgba(239, 68, 68, 0.06)"
                            : undefined,
                      },
                    })}
                    pagination={false}
                    scroll={{ y: panelHeight - 130 }}
                    style={{ background: "transparent" }}
                  />
                </div>
              ) : null,
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
              children: activeTab === "subscribe" ? (
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
              ) : null,
            },
          ]}
          style={{ flex: 1, display: "flex", flexDirection: "column" }}
        />
      </motion.div>
    </div>
  );
};
export default ControlTowerPage;
