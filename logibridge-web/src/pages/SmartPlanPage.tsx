/**
 * SmartPlanPage.tsx — 智能全球物流决策页面
 *
 * 包含：顶部横幅、输入表单、方案对比卡片、选中后详情面板
 */

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  Row,
  Col,
  Form,
  Input,
  Select,
  Button,
  DatePicker,
  InputNumber,
  Switch,
  Card,
  Statistic,
  Collapse,
  Badge,
  Tabs,
  Table,
  Steps,
  Tag,
  Alert,
  Space,
  Typography,
  Empty,
  Spin,
  Divider,
  message,
} from "antd";
import {
  ThunderboltOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  EnvironmentOutlined,
} from "@ant-design/icons";
import CountUp from "react-countup";
import dayjs from "dayjs";
import { motion, AnimatePresence } from "framer-motion";
import GlobeRouteMap from "../components/plan/GlobeRouteMap";
import type { Port } from "../components/plan/types";
import {
  usePlanStore,
  DEFAULT_FORM_DATA,
  type FormData,
  type PlanResult,
  type PlanSegment,
} from "../store/usePlanStore";
import { estimateFreight, searchPorts, searchHsCodes } from "../api/planApi";
import bannerImg from "../assets/images/banner.png";
import iconCost from "../assets/images/icon-cost.png";
import iconTime from "../assets/images/icon-time.png";
import iconShield from "../assets/images/icon-shield.png";

const { Text, Title } = Typography;
const { TextArea } = Input;

// ═══════════════════════════════════════════════════════════════════════
//  常量 & 工具
// ═══════════════════════════════════════════════════════════════════════

const CURRENCIES = ["USD", "EUR", "CNY", "JPY", "GBP"];
const INCOTERMS = ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "DAP", "DDP", "DDU"];
const CONTAINER_TYPES = [
  { value: "20GP", label: "20 尺普柜 (20GP)" },
  { value: "40GP", label: "40 尺普柜 (40GP)" },
  { value: "40HQ", label: "40 尺高柜 (40HQ)" },
];

// ── 港口 → 区域映射（与 freight_estimator.py 一致） ─────────────────

const PORT_REGION_MAP: Record<string, string> = {
  CNHKG: "EA", CNSHA: "EA", CNSGH: "EA", CNNGB: "EA", CNXMN: "EA", CNYTN: "EA",
  KRPUS: "EA", JPYOK: "EA", TWTXG: "EA",
  SGSIN: "SEA", MYPKG: "SEA", THLCH: "SEA", VNHCM: "SEA",
  IDJKT: "SEA", PHMNL: "SEA", AUSYD: "SEA", AUMEL: "SEA", NZAKL: "SEA",
  AEFJR: "MESA", SAJED: "MESA", OMSOO: "MESA", INNSA: "MESA",
  INMAA: "MESA", LKBJM: "MESA", PKKHI: "MESA",
  NLRTM: "EU", DEHAM: "EU", BEANR: "EU", GBFXT: "EU",
  FRLEH: "EU", ESBCN: "EU", ITGIT: "EU", TRISK: "EU",
  USLAX: "NA", USLGB: "NA", USSEA: "NA", USNYC: "NA",
  USSAV: "NA", CAVAN: "NA", MXVER: "NA",
  BRSSZ: "SAMAF", BRRIO: "SAMAF", ARBUE: "SAMAF",
  CLVAP: "SAMAF", PEZLO: "SAMAF", ZADUR: "SAMAF", ZACPT: "SAMAF", NGTIN: "SAMAF", KEMBA: "SAMAF",
  COBAL: "SAMAF", EGPSE: "MESA", HKHKG: "EA", MYTPP: "SEA", AEQWE: "MESA", SADMM: "MESA", PECLL: "SAMAF",
};

function getRegion(code: string): string {
  return PORT_REGION_MAP[code] ?? "";
}

// ── 区域 → 中文区域名（用于查询中转矩阵） ───────────────────────

const REGION_TO_CN: Record<string, string> = {
  EA: "东亚", SEA: "东南亚", MESA: "中东", EU: "欧洲", NA: "北美", SAMAF: "非洲",
};

/** 转运矩阵：中文区域 → 中文区域 → 中文港名列表 */
const TRANSIT_MATRIX_CN: Record<string, Record<string, string[]>> = {
  "东亚-北美西": [],
  "东亚-北美东": ["巴拿马", "釜山"],
  "东亚-欧洲": ["新加坡", "丹戎帕拉帕斯"],
  "东亚-地中海": ["新加坡", "塞得港"],
  "东亚-中东": ["杰贝阿里", "达曼"],
  "东亚-非洲": ["德班", "蒙巴萨"],
  "东亚-南美西": ["巴拿马", "卡亚俄"],
  "东亚-南美东": ["新加坡", "巴拿马"],
  "东亚-东南亚": ["新加坡", "香港", "巴生港"],
  "东亚-澳新": ["悉尼", "墨尔本"],
  "东南亚-北美西": ["香港", "釜山"],
  "东南亚-北美东": ["新加坡", "巴拿马"],
  "东南亚-欧洲": ["新加坡", "丹戎帕拉帕斯"],
  "东南亚-中东": ["杰贝阿里", "新加坡"],
  "东南亚-非洲": ["新加坡", "德班"],
};

/** 中文港名 → UN/LOCODE 代码映射（从 ports.json 验证后整理） */
const CN_PORT_CODES: Record<string, string[]> = {
  "巴拿马": ["COBAL"],
  "釜山": ["KRPUS"],
  "新加坡": ["SGSIN"],
  "丹戎帕拉帕斯": ["MYTPP"],
  "塞得港": ["EGPSE"],
  "杰贝阿里": ["AEQWE"],
  "达曼": ["SADMM"],
  "德班": ["ZADUR"],
  "蒙巴萨": ["KEMBA"],
  "卡亚俄": ["PECLL"],
  "香港": ["HKHKG"],
  "巴生港": ["MYPKG"],
  "悉尼": ["AUSYD"],
  "墨尔本": ["AUMEL"],
};

function getTransitPorts(originCode: string, destCode: string): string[] {
  const oR = REGION_TO_CN[getRegion(originCode)] ?? "";
  const dR = REGION_TO_CN[getRegion(destCode)] ?? "";
  if (!oR || !dR) return [];

  // 北美分东/西海岸
  const naWest = ["USLAX", "USLGB", "USSEA", "CAVAN"];
  const oSuffix = (oR === "北美" && naWest.includes(originCode)) ? "西" : oR === "北美" ? "东" : "";
  const dSuffix = (dR === "北美" && naWest.includes(destCode)) ? "西" : dR === "北美" ? "东" : "";

  const keysToTry = [
    `${oR}-${dR}${dSuffix}`,
    `${oR}-${dR}`,
  ];

  for (const key of keysToTry) {
    const trans = TRANSIT_MATRIX_CN[key];
    if (trans !== undefined) {
      if (trans.length === 0) return [];
      const codes: string[] = [];
      for (const cn of trans) {
        const mapped = CN_PORT_CODES[cn];
        if (mapped) codes.push(...mapped);
      }
      return [...new Set(codes)]; // 去重
    }
  }
  return [];
}

/** 港口坐标映射表 — 挂载时从 /data/ports.json 加载 */
let portCoordCache: Record<string, [number, number]> = {};
let portNameCache: Record<string, string> = {};

async function loadPortsCache() {
  if (Object.keys(portCoordCache).length > 0) return;
  try {
    const resp = await fetch("/data/ports.json");
    const list: Array<{ code: string; name: string; lat: number; lon: number }> =
      await resp.json();
    for (const p of list) {
      portCoordCache[p.code] = [p.lon, p.lat];
      portNameCache[p.code] = p.name;
    }
  } catch {
    console.warn("⚠️ ports.json 加载失败");
  }
}

function getPortCoord(code: string): [number, number] {
  return portCoordCache[code] ?? [0, 0];
}

function getPortName(code: string): string {
  return portNameCache[code] ?? code;
}

function toPortObj(code: string): Port {
  const [lon, lat] = getPortCoord(code);
  return { name: getPortName(code), coordinates: [lon, lat] };
}

// ── 方案生成逻辑 ──────────────────────────────────────────────────

/**
 * 基于运费 API 返回 & 区域中转矩阵，生成三套方案数据
 */
function buildPlans(
  origin: string,
  dest: string,
  containerType: string,
  freight: number,
): PlanResult[] {
  const mainDays = containerType === "20GP" ? 28 : containerType === "40HQ" ? 30 : 26;

  // 查询各方案的中转港
  const transitA: string[] = [];                       // 直达
  const transitB: string[] = getTransitPorts(origin, dest).slice(0, 2);   // 经一个中转
  const transitC: string[] = (() => {
    const t = getTransitPorts(origin, dest);
    if (t.length >= 2) return [t[0]];
    return t.length === 1 ? t : [];
  })();

  const segA: PlanSegment[] = [
    { from: origin, to: dest, transportMode: "sea", estimatedDays: mainDays, freight },
  ];

  const segB: PlanSegment[] = buildSegments(origin, dest, transitB, mainDays, freight, 1.35);
  const segC: PlanSegment[] = buildSegments(origin, dest, transitC, mainDays, freight, 1.15);

  return [
    {
      id: "A",
      label: "海运直达",
      description: "经济实惠，时效稳定",
      totalFreight: freight,
      totalDays: mainDays,
      carbonEmission: Math.round(freight * 1.2),
      riskLevel: "low",
      segments: segA,
      color: [59, 130, 246],
      icon: "cost",
    },
    {
      id: "B",
      label: "多点中转",
      description: "网络覆盖广，衔接灵活",
      totalFreight: Math.round(freight * 1.35),
      totalDays: Math.round(mainDays * 0.75),
      carbonEmission: Math.round(freight * 0.9),
      riskLevel: "medium",
      segments: segB,
      color: [16, 185, 129],
      icon: "speed",
    },
    {
      id: "C",
      label: "单点中转",
      description: "平衡成本与时效",
      totalFreight: Math.round(freight * 1.15),
      totalDays: Math.round(mainDays * 0.88),
      carbonEmission: Math.round(freight * 1.05),
      riskLevel: "low",
      segments: segC,
      color: [245, 158, 11],
      icon: "balance",
    },
  ];
}

/** 根据中转港列表构建航段 */
function buildSegments(
  origin: string,
  dest: string,
  transits: string[],
  baseDays: number,
  baseFreight: number,
  costMultiplier: number,
): PlanSegment[] {
  if (transits.length === 0) {
    return [{ from: origin, to: dest, transportMode: "sea", estimatedDays: baseDays, freight: Math.round(baseFreight * costMultiplier) }];
  }

  const waypoints = [origin, ...transits, dest];
  const segs: PlanSegment[] = [];
  const dayPerSeg = Math.round(baseDays / (waypoints.length - 1));
  const freightPerSeg = Math.round((baseFreight * costMultiplier) / (waypoints.length - 1));

  for (let i = 0; i < waypoints.length - 1; i++) {
    segs.push({
      from: waypoints[i],
      to: waypoints[i + 1],
      transportMode: "sea",
      estimatedDays: dayPerSeg,
      freight: freightPerSeg,
    });
  }
  return segs;
}

// ═══════════════════════════════════════════════════════════════════════
//  组件
// ═══════════════════════════════════════════════════════════════════════

const SmartPlanPage: React.FC = () => {
  const {
    formData,
    results,
    loading,
    selectedIndex,
    setFormData,
    startGeneration,
    setResults,
    selectPlan,
  } = usePlanStore();

  const [portsSearching, setPortsSearching] = useState(false);
  const [originOptions, setOriginOptions] = useState<
    { value: string; label: string }[]
  >([]);
  const [destOptions, setDestOptions] = useState<
    { value: string; label: string }[]
  >([]);
  const [hsOptions, setHsOptions] = useState<
    { value: string; label: string }[]
  >([]);
  const [hsSearching, setHsSearching] = useState(false);

  // 加载港口坐标缓存
  useEffect(() => {
    loadPortsCache();
  }, []);

  // ── 防抖搜索 —— 港口 ──────────────────────────────────────────

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePortSearch = useCallback(
    (q: string, setter: typeof setOriginOptions) => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      if (!q.trim()) {
        setter([]);
        return;
      }
      setPortsSearching(true);
      searchTimerRef.current = setTimeout(async () => {
        try {
          const list = await searchPorts(q);
          setter(
            list.map((p) => ({
              value: p.code,
              label: `${p.code} — ${p.name} (${p.country})`,
            })),
          );
        } catch {
          setter([]);
        }
        setPortsSearching(false);
      }, 300);
    },
    [],
  );

  // ── 防抖搜索 —— HS 编码 ──────────────────────────────────────

  const handleHsSearch = useCallback((q: string) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!q.trim()) {
      setHsOptions([]);
      return;
    }
    setHsSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const list = await searchHsCodes(q);
        setHsOptions(
          list.map((h) => ({
            value: h.code,
            label: `${h.code} — ${h.description}`,
          })),
        );
      } catch {
        setHsOptions([]);
      }
      setHsSearching(false);
    }, 300);
  }, []);

  // ── 更新表单 ─────────────────────────────────────────────────

  const update = (partial: Partial<FormData>) => setFormData(partial);

  // ── 开始推演 ─────────────────────────────────────────────────

  const handleGenerate = async () => {
    const { origin, dest, containerType } = formData;
    if (!origin || !dest || !containerType) return;

    startGeneration();
    try {
      const resp = await estimateFreight(origin, dest, containerType);
      const plans = buildPlans(origin, dest, containerType, resp.total);
      // 短暂延迟让 loading 状态可见
      await new Promise((r) => setTimeout(r, 600));
      setResults(plans);
    } catch (err: unknown) {
      console.error("推演失败", err);
      message.error(err instanceof Error ? err.message : "推演失败，请检查网络连接后重试");
      setResults([]);
    }
  };

  // ── 选中方案 ─────────────────────────────────────────────────

  const selectedPlan =
    selectedIndex >= 0 && selectedIndex < results.length
      ? results[selectedIndex]
      : null;

  // ── 映射到 GlobeRouteMap 的 Port ─────────────────────────────

  const mapPort = (code: string): Port => {
    const [lon, lat] = getPortCoord(code);
    return { name: getPortName(code), coordinates: [lon, lat] };
  };

  const containerVariants = {
    show: { transition: { staggerChildren: 0.1 } },
  };

  const cardVariants = {
    hidden: { opacity: 0, y: 50 },
    show: { opacity: 1, y: 0 },
  };

  // ═════════════════════════════════════════════════════════════
  //  RENDER
  // ═════════════════════════════════════════════════════════════

  return (
    <div>
      {/* ══ 顶部横幅 ══ */}
      <div
        style={{
          padding: "40px 48px",
          background: "linear-gradient(135deg, #1E293B 0%, #0F172A 100%)",
          borderBottom: "1px solid #1E293B",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <Title level={2} style={{ color: "#F1F5F9", margin: 0 }}>
            智能全球物流决策
          </Title>
          <Text type="secondary" style={{ color: "#94A3B8", marginTop: 8 }}>
            输入货物信息，AI 为您推荐最优国际物流方案
          </Text>
        </div>
        <img src={bannerImg} style={{ height: 80 }} alt="banner" />
      </div>

      <div style={{ padding: "24px 48px" }}>
        {/* ══ 输入表单 ══ */}
        <Card
          style={{
            background: "#1E293B",
            borderColor: "#334155",
            marginBottom: 24,
          }}
        >
          <Row gutter={[16, 16]}>
            {/* 起运港 */}
            <Col xs={24} sm={12} lg={6}>
              <Form.Item label={<Text style={{ color: "#CBD5E1" }}>起运港</Text>}>
                <Select
                  showSearch
                  allowClear
                  placeholder="输入港口名或代码"
                  value={formData.origin || undefined}
                  loading={portsSearching}
                  options={originOptions}
                  onSearch={(q) => handlePortSearch(q, setOriginOptions)}
                  onChange={(v) => update({ origin: v ?? "" })}
                  filterOption={false}
                  notFoundContent={null}
                />
              </Form.Item>
            </Col>

            {/* 目的港 */}
            <Col xs={24} sm={12} lg={6}>
              <Form.Item label={<Text style={{ color: "#CBD5E1" }}>目的港</Text>}>
                <Select
                  showSearch
                  allowClear
                  placeholder="输入港口名或代码"
                  value={formData.dest || undefined}
                  loading={portsSearching}
                  options={destOptions}
                  onSearch={(q) => handlePortSearch(q, setDestOptions)}
                  onChange={(v) => update({ dest: v ?? "" })}
                  filterOption={false}
                  notFoundContent={null}
                />
              </Form.Item>
            </Col>

            {/* HS 编码 */}
            <Col xs={24} sm={12} lg={6}>
              <Form.Item label={<Text style={{ color: "#CBD5E1" }}>HS 编码</Text>}>
                <Select
                  showSearch
                  allowClear
                  placeholder="输入HS编码或关键词"
                  value={formData.hsCode || undefined}
                  loading={hsSearching}
                  options={hsOptions}
                  onSearch={handleHsSearch}
                  onChange={(v) => update({ hsCode: v ?? "" })}
                  filterOption={false}
                  notFoundContent={null}
                />
              </Form.Item>
            </Col>

            {/* 集装箱类型 */}
            <Col xs={24} sm={12} lg={6}>
              <Form.Item label={<Text style={{ color: "#CBD5E1" }}>集装箱</Text>}>
                <Select
                  allowClear
                  placeholder="选择箱型"
                  value={formData.containerType || undefined}
                  options={CONTAINER_TYPES}
                  onChange={(v) => update({ containerType: v ?? "" })}
                />
              </Form.Item>
            </Col>

            {/* 货物价值 */}
            <Col xs={24} sm={12} lg={6}>
              <Form.Item label={<Text style={{ color: "#CBD5E1" }}>货值 (USD)</Text>}>
                <InputNumber
                  style={{ width: "100%" }}
                  placeholder="eg. 50000"
                  min={0}
                  value={formData.cargoValue ? Number(formData.cargoValue) : null}
                  onChange={(v) => update({ cargoValue: v?.toString() ?? "" })}
                  allowClear
                />
              </Form.Item>
            </Col>

            {/* 币种 */}
            <Col xs={24} sm={12} lg={6}>
              <Form.Item label={<Text style={{ color: "#CBD5E1" }}>币种</Text>}>
                <Select
                  allowClear
                  value={formData.currency || undefined}
                  options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                  onChange={(v) => update({ currency: v ?? "USD" })}
                />
              </Form.Item>
            </Col>

            {/* 最晚到港日期 */}
            <Col xs={24} sm={12} lg={6}>
              <Form.Item label={<Text style={{ color: "#CBD5E1" }}>最晚到港</Text>}>
                <DatePicker
                  style={{ width: "100%" }}
                  value={formData.arrivalDeadline ? dayjs(formData.arrivalDeadline) : null}
                  onChange={(d) =>
                    update({ arrivalDeadline: d?.format("YYYY-MM-DD") ?? "" })
                  }
                />
              </Form.Item>
            </Col>

            {/* 贸易术语 */}
            <Col xs={24} sm={12} lg={6}>
              <Form.Item label={<Text style={{ color: "#CBD5E1" }}>贸易术语</Text>}>
                <Select
                  allowClear
                  placeholder="选择 Incoterm"
                  value={formData.incoterm || undefined}
                  options={INCOTERMS.map((t) => ({ value: t, label: t }))}
                  onChange={(v) => update({ incoterm: v ?? "" })}
                />
              </Form.Item>
            </Col>
          </Row>

          {/* 高级选项折叠 */}
          <Collapse
            ghost
            items={[
              {
                key: "advanced",
                label: <Text style={{ color: "#64748B" }}>高级选项</Text>,
                children: (
                  <Row gutter={16}>
                    <Col>
                      <Form.Item
                        label={<Text style={{ color: "#CBD5E1" }}>危险品</Text>}
                      >
                        <Switch
                          checked={formData.isDangerous}
                          onChange={(v) => update({ isDangerous: v })}
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                ),
              },
            ]}
            style={{ marginTop: 8 }}
          />

          <Divider style={{ borderColor: "#334155", margin: "16px 0" }} />

          {/* 提交按钮 */}
          <Button
            type="primary"
            size="large"
            icon={<ThunderboltOutlined />}
            loading={loading}
            disabled={
              !formData.origin ||
              !formData.dest ||
              !formData.containerType
            }
            onClick={handleGenerate}
            style={{ height: 48, fontSize: 16, paddingInline: 32 }}
          >
            {loading ? "AI 推演中..." : "开始智能推演"}
          </Button>
        </Card>

        {/* ══ 方案对比区 ══ */}
        {loading && (
          <div
            style={{
              textAlign: "center",
              padding: "80px 0",
            }}
          >
            <Spin
              size="large"
              tip="AI 正在计算最优路线..."
            >
              <div style={{ padding: 1 }} />
            </Spin>
            <div
              style={{
                marginTop: 24,
                color: "#94A3B8",
                fontSize: 14,
              }}
            >
              正在计算最优路线与费用...
            </div>
          </div>
        )}

        {!loading && results.length === 0 && (
          <Empty
            description={
              <Text style={{ color: "#64748B" }}>
                请输入起运港、目的港和箱型，点击"开始智能推演"
              </Text>
            }
            style={{ padding: "60px 0" }}
          />
        )}

        {results.length > 0 && (
          <>
          <AnimatePresence mode="wait">
            <motion.div
              key="results"
              variants={containerVariants}
              initial="hidden"
              animate="show"
            >
              <Title level={4} style={{ color: "#F1F5F9", marginBottom: 16 }}>
                方案对比
              </Title>
              <Row gutter={[16, 16]}>
                {results.map((plan, idx) => (
                  <Col xs={24} md={12} lg={8} key={plan.id}>
                    <motion.div variants={cardVariants}>
                      <Card
                        hoverable
                        style={{
                          background: "#1E293B",
                          borderColor:
                            selectedIndex === idx ? "#3B82F6" : "#334155",
                          borderRadius: 8,
                          position: "relative",
                          overflow: "hidden",
                        }}
                        onClick={() => selectPlan(idx)}
                      >
                        {/* 顶部方案图标 + 标签 */}
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: 12,
                          }}
                        >
                          <Space>
                            <div
                              style={{
                                width: 40,
                                height: 40,
                                borderRadius: 8,
                                background: `rgba(${plan.color.join(",")},0.15)`,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 20,
                              }}
                            >
                              {plan.id === "A" ? (
                                <img src={iconCost} width={32} alt="cost" />
                              ) : plan.id === "B" ? (
                                <img src={iconTime} width={32} alt="speed" />
                              ) : (
                                <img src={iconShield} width={32} alt="balance" />
                              )}
                            </div>
                            <div>
                              <div style={{ color: "#F1F5F9", fontWeight: 600 }}>
                                {plan.label}
                              </div>
                              <div style={{ color: "#94A3B8", fontSize: 12 }}>
                                {plan.description}
                              </div>
                            </div>
                          </Space>
                          {selectedIndex === idx && (
                            <CheckCircleOutlined style={{ color: "#3B82F6", fontSize: 20 }} />
                          )}
                        </div>

                        {/* 总费用动画 */}
                        <div style={{ margin: "8px 0" }}>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            总费用
                          </Text>
                          <div style={{ fontSize: 28, fontWeight: 700, color: "#F1F5F9" }}>
                            <CountUp
                              end={plan.totalFreight}
                              duration={1.5}
                              separator=","
                              prefix="$"
                              decimals={0}
                            />
                          </div>
                        </div>

                        {/* 耗时 */}
                        <Space style={{ marginBottom: 12, color: "#94A3B8" }}>
                          <ClockCircleOutlined />
                          <span>
                            <CountUp start={0} end={plan.totalDays} duration={1.5} suffix=" 天" decimals={0} />
                          </span>
                          <Divider type="vertical" style={{ borderColor: "#334155" }} />
                          <EnvironmentOutlined />
                          <span>
                            {plan.segments.map((s) => s.transportMode.toUpperCase()).join("→")}
                          </span>
                        </Space>

                        {/* 小地图 */}
                        <div style={{ height: 140, borderRadius: 6, overflow: "hidden", marginBottom: 12 }}>
                          <GlobeRouteMap
                            origin={mapPort(formData.origin)}
                            destination={mapPort(formData.dest)}
                            via={plan.segments
                              .slice(1)
                              .map((s) => mapPort(s.from))}
                            color={plan.color}
                          />
                        </div>

                        {/* 碳排 + 风险 */}
                        <Row gutter={16} style={{ marginBottom: 12 }}>
                          <Col span={12}>
                            <Text style={{ color: "#94A3B8", fontSize: 12 }}>
                              碳排放
                            </Text>
                            <div style={{ color: "#F1F5F9" }}>
                              <CountUp
                                end={plan.carbonEmission}
                                duration={1}
                                suffix=" kg"
                              />
                            </div>
                          </Col>
                          <Col span={12}>
                            <Text style={{ color: "#94A3B8", fontSize: 12 }}>
                              风险等级
                            </Text>
                            <div>
                              <Badge
                                status={
                                  plan.riskLevel === "low"
                                    ? "success"
                                    : plan.riskLevel === "medium"
                                      ? "warning"
                                      : "error"
                                }
                                text={
                                  <span style={{ color: "#F1F5F9" }}>
                                    {plan.riskLevel === "low"
                                      ? "低风险"
                                      : plan.riskLevel === "medium"
                                        ? "中风险"
                                        : "高风险"}
                                  </span>
                                }
                              />
                            </div>
                          </Col>
                        </Row>

                        {/* 选择按钮 */}
                        <Button
                          type={selectedIndex === idx ? "primary" : "default"}
                          block
                          onClick={(e) => {
                            e.stopPropagation();
                            selectPlan(idx);
                          }}
                        >
                          {selectedIndex === idx ? "已选择" : "选择此方案"}
                        </Button>
                      </Card>
                    </motion.div>
                  </Col>
                ))}
              </Row>
            </motion.div>
          </AnimatePresence>

          {/* ══ 方案详情面板（选中后显示）══ */}
          {selectedPlan && (
              <Card
                style={{
                  marginTop: 24,
                  background: "#1E293B",
                  borderColor: "#334155",
                }}
              >
                <Title level={5} style={{ color: "#F1F5F9", marginBottom: 16 }}>
                  {selectedPlan.label} — 方案详情
                </Title>

                <Tabs
                  defaultActiveKey="fee"
                  items={[
                    // Tab 1: 费用明细
                    {
                      key: "fee",
                      label: "费用明细",
                      children: (
                        <Table
                          dataSource={[
                            {
                              key: "base",
                              item: "基准海运费",
                              amount: `$${selectedPlan.segments[0].freight.toLocaleString()}`,
                            },
                            {
                              key: "baf",
                              item: "燃油附加费 (BAF 15%)",
                              amount: `$${Math.round(selectedPlan.segments[0].freight * 0.15).toLocaleString()}`,
                            },
                            {
                              key: "lsf",
                              item: "低硫附加费 (LSF 8%)",
                              amount: `$${Math.round(selectedPlan.segments[0].freight * 0.08).toLocaleString()}`,
                            },
                            {
                              key: "cong",
                              item: "港口拥堵费",
                              amount: "$200",
                            },
                            {
                              key: "total",
                              item: (
                                <strong style={{ color: "#3B82F6" }}>
                                  总费用
                                </strong>
                              ),
                              amount: (
                                <strong style={{ color: "#3B82F6" }}>
                                  ${selectedPlan.totalFreight.toLocaleString()}
                                </strong>
                              ),
                            },
                          ]}
                          columns={[
                            {
                              title: "费用项",
                              dataIndex: "item",
                              key: "item",
                            },
                            {
                              title: "金额",
                              dataIndex: "amount",
                              key: "amount",
                              align: "right",
                            },
                          ]}
                          pagination={false}
                          size="small"
                          style={{ background: "transparent" }}
                        />
                      ),
                    },

                    // Tab 2: 转运时间线
                    {
                      key: "timeline",
                      label: "转运时间线",
                      children: (
                        <Steps
                          direction="vertical"
                          current={-1}
                          items={selectedPlan.segments.map((seg, i) => ({
                            title: (
                              <span style={{ color: "#F1F5F9" }}>
                                {getPortName(seg.from)} → {getPortName(seg.to)}
                              </span>
                            ),
                            description: (
                              <span style={{ color: "#94A3B8" }}>
                                {seg.transportMode.toUpperCase()} · 约{seg.estimatedDays}天 · $
                                {seg.freight.toLocaleString()}
                              </span>
                            ),
                            status: "process" as const,
                          }))}
                        />
                      ),
                    },

                    // Tab 3: 单证清单
                    {
                      key: "docs",
                      label: "单证清单",
                      children: (
                        <Space direction="vertical" style={{ width: "100%" }}>
                          {[
                            "提单 (Bill of Lading)",
                            "商业发票 (Commercial Invoice)",
                            "装箱单 (Packing List)",
                            "原产地证书 (Certificate of Origin)",
                            "保险单 (Insurance Policy)",
                            "海关出口报关单",
                            "货物运输保险单",
                          ].map((doc) => (
                            <div
                              key={doc}
                              style={{
                                padding: "8px 12px",
                                background: "#0F172A",
                                borderRadius: 6,
                                color: "#CBD5E1",
                              }}
                            >
                              📄 {doc}
                            </div>
                          ))}
                        </Space>
                      ),
                    },

                    // Tab 4: 风险提示
                    {
                      key: "risk",
                      label: "风险提示",
                      children: (
                        <div>
                          <Alert
                            type={
                              selectedPlan.riskLevel === "low"
                                ? "success"
                                : selectedPlan.riskLevel === "medium"
                                  ? "warning"
                                  : "error"
                            }
                            showIcon
                            message={`风险等级：${
                              selectedPlan.riskLevel === "low"
                                ? "低"
                                : selectedPlan.riskLevel === "medium"
                                  ? "中"
                                  : "高"
                            }`}
                            description={
                              selectedPlan.riskLevel === "low"
                                ? "该方案航线成熟、季节性波动小，建议优先考虑。"
                                : selectedPlan.riskLevel === "medium"
                                  ? "涉及中转港衔接，需关注班期准点率，建议预留缓冲时间。"
                                  : "高风险航线 — 建议购买额外货运保险并密切跟踪航运动态。"
                            }
                            style={{ marginBottom: 16 }}
                          />
                          <Space direction="vertical" style={{ width: "100%" }}>
                            <Text style={{ color: "#94A3B8" }}>
                              ⚠️ 燃油价格波动可能影响 BAF 费用
                            </Text>
                            <Text style={{ color: "#94A3B8" }}>
                              ⚠️ 目的港清关政策变动可能导致延误
                            </Text>
                            <Text style={{ color: "#94A3B8" }}>
                              ⚠️ 建议在确认方案前核实最新港口拥堵情况
                            </Text>
                          </Space>
                        </div>
                      ),
                    },
                  ]}
                />
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default SmartPlanPage;
