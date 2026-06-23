/**
 * CompliancePage.tsx — 合规体检页面
 *
 * 布局：左栏 40% (货物信息 + 风险结果)，右栏 60% (单证清单 + 智能填单)
 */

import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Row,
  Col,
  Card,
  Input,
  AutoComplete,
  Select,
  Button,
  InputNumber,
  DatePicker,
  Upload,
  Divider,
  Typography,
  List,
  Tag,
  Badge,
  Alert,
  Space,
  Descriptions,
  Empty,
  Spin,
  message,
  Tooltip,
  Form,
  Collapse,
  Modal,
  Image,
  Skeleton,
} from "antd";
import {
  SafetyOutlined,
  ThunderboltOutlined,
  DownloadOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  EditOutlined,
  FileTextOutlined,
  BulbOutlined,
  CloudUploadOutlined,
  SendOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import CountUp from "react-countup";
import type { UploadProps } from "antd";
import {
  useComplianceStore,
  COUNTRIES,
  type ComplianceFormData,
} from "../store/useComplianceStore";
import {
  getDocTemplate,
  generateDocument,
  searchHsCodes,
  type DocTemplate,
} from "../api/complianceApi";
import emptyStateImg from "../assets/images/empty-state.png";

const { Text, Title } = Typography;

// ── 常量 ──────────────────────────────────────────────────────────

const INCOTERMS = [
  { value: "EXW", label: "EXW" },
  { value: "FCA", label: "FCA" },
  { value: "FAS", label: "FAS" },
  { value: "FOB", label: "FOB" },
  { value: "CFR", label: "CFR" },
  { value: "CIF", label: "CIF" },
  { value: "CPT", label: "CPT" },
  { value: "CIP", label: "CIP" },
  { value: "DAP", label: "DAP" },
  { value: "DPU", label: "DPU" },
  { value: "DDP", label: "DDP" },
];

const CURRENCIES = [
  { value: "USD", label: "$ USD" },
  { value: "CNY", label: "¥ CNY" },
  { value: "EUR", label: "€ EUR" },
];

const DOC_TYPES = [
  { key: "bill_of_lading", label: "提单 (Bill of Lading)" },
  { key: "commercial_invoice", label: "商业发票 (Commercial Invoice)" },
  { key: "packing_list", label: "装箱单 (Packing List)" },
  { key: "certificate_of_origin", label: "原产地证书 (Certificate of Origin)" },
];

// 外部办理的单证
const EXTERNAL_DOCS = ["certificate_of_origin"];

// ── 页面组件 ──────────────────────────────────────────────────────

const CompliancePage: React.FC = () => {
  const navigate = useNavigate();
  const {
    formData,
    scanResult,
    loading,
    selectedDoc,
    docFormData,
    setFormData,
    startScan,
    setScanResult,
    selectDoc,
    updateDocForm,
    clearDocForm,
  } = useComplianceStore();

  const [docTemplate, setDocTemplate] = useState<DocTemplate | null>(null);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [currency, setCurrency] = useState("USD");
  const [hsOptions, setHsOptions] = useState<{ value: string; label: string }[]>([]);
  const [hsSearching, setHsSearching] = useState(false);
  const [form] = Form.useForm();
  const [assistModalOpen, setAssistModalOpen] = useState(false);
  const [assistDocType, setAssistDocType] = useState("");
  const [fileList, setFileList] = useState<any[]>([]);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── 表单更新 ─────────────────────────────────────────────────

  const update = (partial: Partial<ComplianceFormData>) =>
    setFormData(partial);

  // ── HS 编码搜索 ─────────────────────────────────────────────

  const handleHsSearch = (q: string) => {
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
  };

  // ── 开始扫描（Store 中已封装 API 调用和错误处理） ─────────────

  const handleScan = () => {
    const { hsCode, destCountry, cargoValue } = formData;
    if (!hsCode || !destCountry || !cargoValue) return;
    startScan();
  };

  // ── 选择单证 ─────────────────────────────────────────────────

  const handleSelectDoc = async (docType: string | null) => {
    selectDoc(docType);
    if (!docType) {
      setDocTemplate(null);
      form.resetFields();
      return;
    }
    setTemplateLoading(true);
    try {
      const tmpl = await getDocTemplate(docType);
      setDocTemplate(tmpl);
      clearDocForm();

      // 预填某些已知字段
      const initial: Record<string, any> = {};
      for (const f of tmpl.fields) {
        if (f.name === "hsCode" && formData.hsCode) initial[f.name] = formData.hsCode;
        else if (f.name === "originCountry" && formData.originCountry) initial[f.name] = "China";
        else if (f.name === "countryOfOrigin") initial[f.name] = "China";
        else if (f.name === "incoterm" && formData.incoterm) initial[f.name] = formData.incoterm;
        else if (f.type === "date") initial[f.name] = null;
        else if (f.type === "number") initial[f.name] = null;
        else initial[f.name] = "";
      }
      form.setFieldsValue(initial);
    } catch {
      message.error("加载单证模板失败");
    }
    setTemplateLoading(false);
  };

  // ── 动态渲染表单字段 ────────────────────────────────────────

  const renderDocField = (field: DocTemplate["fields"][number]) => {
    const commonStyle = { background: "#0F172A", borderColor: "#334155" };

    switch (field.type) {
      case "select":
        return (
          <Select
            allowClear
            style={{ width: "100%", ...commonStyle }}
            placeholder={field.label}
            options={field.options?.map((o) => ({ value: o, label: o })) ?? []}
            onChange={(v) => updateDocForm(field.name, v ?? "")}
          />
        );
      case "textarea":
        return (
          <Input.TextArea
            allowClear
            rows={2}
            placeholder={field.label}
            style={commonStyle}
            onChange={(e) => updateDocForm(field.name, e.target.value)}
          />
        );
      case "number":
        return (
          <InputNumber
            style={{ width: "100%", ...commonStyle }}
            placeholder={field.label}
            min={0}
            onChange={(v) => updateDocForm(field.name, v?.toString() ?? "")}
          />
        );
      case "date":
        return (
          <DatePicker
            style={{ width: "100%" }}
            placeholder={field.label}
            onChange={(_d, ds) => updateDocForm(field.name, ds ?? "")}
          />
        );
      default:
        return (
          <Input
            allowClear
            placeholder={field.label}
            style={commonStyle}
            onChange={(e) => updateDocForm(field.name, e.target.value)}
          />
        );
    }
  };

  // ── 生成 PDF（同时也被 Form.onFinish 调用）───────────────

  const handleGenerate = async (values?: Record<string, any>) => {
    if (!selectedDoc) return;
    setGenerating(true);
    try {
      // 从 form 或 docFormData 获取数据
      const filledFields: Record<string, string> = {};
      const source = values ?? docFormData;
      for (const [key, val] of Object.entries(source)) {
        if (val !== null && val !== undefined && String(val).trim()) {
          filledFields[key] = String(val);
        }
      }
      if (scanResult && !filledFields["hsCode"]) {
        filledFields["hsCode"] = scanResult.hsCode;
      }
      if (!filledFields["originCountry"]) {
        filledFields["originCountry"] = formData.originCountry === "CN" ? "China" : "Other";
      }
      await generateDocument({ docType: selectedDoc, fields: filledFields });
      message.success("单证生成成功！");
    } catch {
      message.error("单证生成失败");
    }
    setGenerating(false);
  };

  // ── AI 填充字段 ─────────────────────────────────────────────

  const handleAiFill = (name: string) => {
    const field = docTemplate?.fields.find((f) => f.name === name);
    const label = field?.label ?? name;
    const suggestions: Record<string, string> = {
      exporter: "Shanghai Textile Import & Export Co., Ltd",
      consignee: "Sample Buyer Corp.",
      shipper: "Shanghai Textile Import & Export Co., Ltd",
      invoiceNo: `INV-${Date.now().toString(36).toUpperCase()}`,
      containerNo: "CMAU" + Math.random().toString(36).substring(2, 8).toUpperCase(),
      vessel: "CMA CGM COLUMBIA / 123W",
      portOfLoading: "Shanghai, China",
      portOfDischarge: "Los Angeles, USA",
      incoterm: formData.incoterm || "FOB",
      hsCode: formData.hsCode,
      goodsDesc: `Goods under HS code ${formData.hsCode}`,
      originCountry: "China",
      countryOfOrigin: "China",
      date: new Date().toISOString().slice(0, 10),
      invoiceDate: new Date().toISOString().slice(0, 10),
      issuingDate: new Date().toISOString().slice(0, 10),
      netWeight: "500",
      grossWeight: "550",
      measurement: "2.5",
      totalValue: formData.cargoValue || "50000",
    };
    updateDocForm(name, suggestions[name] ?? `Sample ${label}`);
    message.info(`已自动填充: ${label}`);
  };

  // ── 上传配置（带缩略图预览） ─────────────────────────────

  const uploadProps: UploadProps = {
    name: "file",
    accept: ".jpg,.jpeg,.png",
    maxCount: 1,
    listType: "picture-card",
    fileList,
    beforeUpload: (file) => {
      if (file.size > 2 * 1024 * 1024) {
        message.error("图片不能超过 2MB");
        return Upload.LIST_IGNORE;
      }
      return false;
    },
    onChange: (info) => {
      setFileList(info.fileList);
      if (info.fileList.length > 0 && info.file.status !== "removed") {
        message.success("产品图片已上传");
      }
    },
    onRemove: () => {
      setFileList([]);
      return true;
    },
  };

  // ── 协助办理 Modal ──────────────────────────────────────

  const handleAssistClick = (docType: string) => {
    setAssistDocType(docType);
    setAssistModalOpen(true);
  };

  const handleAssistConfirm = () => {
    setAssistModalOpen(false);
    message.success("已转交顾问处理，请前往「工作台」查看进度");
    navigate("/consultation");
  };

  // ── 风险颜色 & Collapse 文案映射 ─────────────────────────

  const riskRegulationSummary: Record<string, string> = {
    anti_dumping: "根据 WTO《反倾销协定》及目的国国内贸易救济法规，被裁定反倾销的产品在进口时需按终裁税率缴纳额外关税保证金。税率取决于产品倾销幅度，通常每 12-18 个月进行一次行政复审。",
    additional_tariff: "该额外关税依据目的国贸易法条款（如美国《1974 年贸易法》第 301 节）征收。除非被撤销或到期，该关税在适用期间对进口商品持续有效。部分商品可能享有排除豁免，需单独申请。",
  };

  const isHighRisk =
    scanResult?.risks.some((r) => r.level === "high") ?? false;
  const isWarning =
    scanResult?.risks.some((r) => r.level === "medium") ?? false;

  // ═════════════════════════════════════════════════════════════
  //  RENDER
  // ═════════════════════════════════════════════════════════════

  return (
    <div>
      {/* ══ 顶部横幅 ══ */}
      <div
        style={{
          padding: "32px 48px",
          background: "linear-gradient(135deg, #1E293B 0%, #0F172A 100%)",
          borderBottom: "1px solid #1E293B",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <Title level={2} style={{ color: "#F1F5F9", margin: 0 }}>
            合规体检
          </Title>
          <Text type="secondary" style={{ color: "#94A3B8", marginTop: 8 }}>
            一键扫描出口商品的关税、反倾销、认证要求与合规风险
          </Text>
        </div>
        <SafetyOutlined style={{ fontSize: 56, color: "#3B82F6", opacity: 0.3 }} />
      </div>

      <div style={{ padding: "20px 48px" }}>
        <Row gutter={[24, 24]}>
          {/* ═══════════════════════════════════════════════════════════
              左栏 40%：货物信息 + 风险结果
              ═══════════════════════════════════════════════════════════ */}
          <Col xs={24} lg={{ span: 9, push: 0 }}>
            {/* ── 卡片 1：货物信息表单 ── */}
            <Card
              title={<span style={{ color: "#F1F5F9 }}>货物信息</span>}
              style={{ background: "#1E293B", borderColor: "#334155", marginBottom: 24 }}
            >
              <Space direction="vertical" size={16} style={{ width: "100%" }}>
                {/* HS 编码 */}
                <div>
                  <Text style={{ color: "#94A3B8", fontSize: 13, display: "block", marginBottom: 4 }}>
                    HS 编码 <span style={{ color: "#EF4444" }}>*</span>
                  </Text>
                  <AutoComplete
                    style={{ width: "100%" }}
                    value={formData.hsCode}
                    options={hsOptions}
                    onSearch={handleHsSearch}
                    onSelect={(v) => update({ hsCode: v })}
                    onChange={(v) => update({ hsCode: v })}
                    placeholder="输入 HS 编码或品名"
                    allowClear
                    notFoundContent={
                      hsSearching ? <Spin size="small" /> : null
                    }
                  />
                </div>

                {/* 原产国 */}
                <div>
                  <Text style={{ color: "#94A3B8", fontSize: 13, display: "block", marginBottom: 4 }}>
                    原产国
                  </Text>
                  <Select
                    style={{ width: "100%" }}
                    value={formData.originCountry || "CN"}
                    options={[{ value: "CN", label: "🇨🇳 中国" }]}
                    onChange={(v) => update({ originCountry: v })}
                  />
                </div>

                {/* 目的国 */}
                <div>
                  <Text style={{ color: "#94A3B8", fontSize: 13, display: "block", marginBottom: 4 }}>
                    目的国 <span style={{ color: "#EF4444" }}>*</span>
                  </Text>
                  <Select
                    showSearch
                    style={{ width: "100%" }}
                    placeholder="选择目的国"
                    value={formData.destCountry || undefined}
                    options={COUNTRIES}
                    onChange={(v) => update({ destCountry: v ?? "" })}
                    allowClear
                  />
                </div>

                {/* 货值 + 币种 */}
                <div>
                  <Text style={{ color: "#94A3B8", fontSize: 13, display: "block", marginBottom: 4 }}>
                    货值
                  </Text>
                  <InputNumber
                    style={{ width: "100%" }}
                    placeholder="eg. 50000"
                    min={0}
                    prefix={
                      <Select
                        value={currency}
                        onChange={setCurrency}
                        options={CURRENCIES}
                        variant="borderless"
                        style={{ width: 80 }}
                      />
                    }
                    value={formData.cargoValue ? Number(formData.cargoValue) : null}
                    onChange={(v) => update({ cargoValue: v?.toString() ?? "" })}
                    allowClear
                  />
                </div>

                {/* 贸易术语 */}
                <div>
                  <Text style={{ color: "#94A3B8", fontSize: 13, display: "block", marginBottom: 4 }}>
                    贸易术语
                  </Text>
                  <Select
                    style={{ width: "100%" }}
                    placeholder="选择 Incoterm"
                    value={formData.incoterm || undefined}
                    options={INCOTERMS}
                    onChange={(v) => update({ incoterm: v ?? "" })}
                    allowClear
                  />
                </div>

                {/* 产品图片上传 */}
                <div>
                  <Text style={{ color: "#94A3B8", fontSize: 13, display: "block", marginBottom: 4 }}>
                    产品图片（可选）
                  </Text>
                  <Upload {...uploadProps}>
                    {fileList.length < 1 && (
                      <div style={{ padding: "16px 0", textAlign: "center" }}>
                        <CloudUploadOutlined style={{ fontSize: 24, color: "#3B82F6" }} />
                        <div style={{ color: "#94A3B8", fontSize: 12 }}>点击上传 JPG/PNG</div>
                        <div style={{ color: "#64748B", fontSize: 11 }}>最大 2MB</div>
                      </div>
                    )}
                  </Upload>
                </div>

                {/* 扫描按钮 */}
                <Button
                  type="primary"
                  size="large"
                  block
                  icon={<ThunderboltOutlined />}
                  loading={loading}
                  disabled={
                    !formData.hsCode || !formData.destCountry || !formData.cargoValue
                  }
                  onClick={handleScan}
                  style={{ height: 44, fontSize: 15 }}
                >
                  {loading ? "扫描中..." : "开始合规扫描"}
                </Button>
              </Space>
            </Card>

            {/* ── 卡片 2：风险与税费预估（扫描后显示） ── */}
            {loading && (
              <div style={{ textAlign: "center", padding: "40px 0" }}>
                <Spin size="large" />
                <div style={{ marginTop: 12, color: "#94A3B8" }}>
                  正在分析目的国合规要求...
                </div>
              </div>
            )}

            {!loading && scanResult && (
              <motion.div
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              >
              <Card
                title={<span style={{ color: "#F1F5F9" }}>风险与税费预估</span>}
                style={{ background: "#1E293B", borderColor: "#334155" }}
              >
                {/* 风险 Alert */}
                {isHighRisk && (
                  <Alert
                    type="error"
                    showIcon
                    message={
                      <span style={{ fontWeight: 600 }}>
                        存在 {scanResult.risks.filter((r) => r.level === "high").length} 项高风险
                      </span>
                    }
                    style={{ marginBottom: 16, background: "#7F1D1D", border: "none", color: "#FCA5A5" }}
                  />
                )}
                {!isHighRisk && isWarning && (
                  <Alert
                    type="warning"
                    showIcon
                    message="存在中等风险项，请注意核查"
                    style={{ marginBottom: 16, background: "#78350F", border: "none", color: "#FDBA74" }}
                  />
                )}
                {scanResult.risks.length === 0 && (
                  <Alert
                    type="success"
                    showIcon
                    message="未发现风险"
                    style={{ marginBottom: 16, background: "#064E3B", border: "none", color: "#6EE7B7" }}
                  />
                )}

                {/* 风险条目（Collapse 展开法规摘要） */}
                <Collapse
                  ghost
                  expandIconPosition="end"
                  items={scanResult.risks.map((risk, i) => ({
                    key: String(i),
                    label: (
                      <Space>
                        <span style={{ fontSize: 14 }}>
                          {risk.level === "high" ? "🚫" : "⚠️"}
                        </span>
                        <span style={{ color: "#F1F5F9", fontWeight: 600, fontSize: 13 }}>
                          {risk.type === "anti_dumping"
                            ? "反倾销风险"
                            : risk.type === "additional_tariff"
                              ? "额外关税风险"
                              : risk.type}
                        </span>
                        <Tag color={risk.level === "high" ? "red" : "orange"}>
                          {risk.rate}
                        </Tag>
                      </Space>
                    ),
                    children: (
                      <div style={{ color: "#CBD5E1", fontSize: 13 }}>
                        <div style={{ marginBottom: 8 }}>{risk.description}</div>
                        <div style={{ color: "#94A3B8", fontSize: 12, borderTop: "1px solid #334155", paddingTop: 8, marginTop: 4 }}>
                          <Text type="secondary" style={{ fontSize: 11 }}>📜 法规原文摘要：</Text>
                          <div style={{ marginTop: 4, lineHeight: 1.6 }}>
                            {riskRegulationSummary[risk.type] || "详见目的国海关及贸易救济机构公告。"}
                          </div>
                        </div>
                      </div>
                    ),
                  }))}
                  style={{ background: "transparent" }}
                />

                <Divider style={{ borderColor: "#334155", margin: "12px 0" }} />

                {/* 税费汇总 */}
                <Descriptions
                  column={1}
                  size="small"
                  styles={{
                    label: { color: "#94A3B8", paddingBottom: 8 },
                    content: { color: "#F1F5F9", paddingBottom: 8 },
                  }}
                >
                  <Descriptions.Item label="最惠国关税">
                    ${scanResult.tariffs.mfn.amount.toLocaleString()}
                    <span style={{ color: "#64748B", fontSize: 11, marginLeft: 4 }}>
                      ({scanResult.tariffs.mfn.rate}%)
                    </span>
                  </Descriptions.Item>
                  <Descriptions.Item label="额外关税（301/反倾销等）">
                    ${scanResult.tariffs.additional.amount.toLocaleString()}
                    <span style={{ color: "#64748B", fontSize: 11, marginLeft: 4 }}>
                      (+{scanResult.tariffs.additional.rate}%)
                    </span>
                  </Descriptions.Item>
                  <Descriptions.Item label="预估增值税">
                    ${scanResult.vat.estimated_amount.toLocaleString()}
                    <span style={{ color: "#64748B", fontSize: 11, marginLeft: 4 }}>
                      ({scanResult.vat.rate}%)
                    </span>
                  </Descriptions.Item>
                  <Descriptions.Item
                    label={<span style={{ color: "#3B82F6", fontWeight: 700 }}>合计税费</span>}
                  >
                    <span style={{ color: "#3B82F6", fontWeight: 700, fontSize: 18 }}>
                      <CountUp
                        end={scanResult.totalDutyAndTax}
                        duration={1.5}
                        prefix="$"
                        separator=","
                        decimals={0}
                      />
                    </span>
                  </Descriptions.Item>
                </Descriptions>

                <div style={{ color: "#64748B", fontSize: 11, marginTop: 8, textAlign: "center" }}>
                  此为预估金额，实际以海关核定为准
                </div>
              </Card>
              </motion.div>
            )}
          </Col>

          {/* ═══════════════════════════════════════════════════════════
              右栏 60%：单证清单 + 智能填单
              ═══════════════════════════════════════════════════════════ */}
          <Col xs={24} lg={{ span: 14, push: 1 }}>
            {loading && !scanResult ? (
              /* ── 加载中：Skeleton 骨架屏 ── */
              <div>
                <Card
                  title={<span style={{ color: "#F1F5F9" }}>必需单证清单</span>}
                  style={{ background: "#1E293B", borderColor: "#334155", marginBottom: 24 }}
                >
                  <Skeleton active paragraph={{ rows: 1 }} title={false} style={{ marginBottom: 16 }} />
                  <Skeleton active paragraph={{ rows: 1 }} title={false} style={{ marginBottom: 16 }} />
                  <Skeleton active paragraph={{ rows: 1 }} title={false} />
                </Card>
                <Card
                  title={<span style={{ color: "#64748B" }}>智能填单区</span>}
                  style={{ background: "#1E293B", borderColor: "#334155" }}
                >
                  <Skeleton active paragraph={{ rows: 2 }} />
                  <div style={{ height: 12 }} />
                  <Skeleton active paragraph={{ rows: 2 }} />
                  <div style={{ height: 12 }} />
                  <Skeleton active paragraph={{ rows: 1 }} />
                </Card>
              </div>
            ) : (!scanResult && !loading ? (
              /* ── 空状态 ── */
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "60px 20px",
                  background: "#1E293B",
                  borderRadius: 8,
                  border: "1px solid #334155",
                }}
              >
                <img
                  src={emptyStateImg}
                  alt="empty"
                  style={{ width: 200, opacity: 0.6, marginBottom: 16 }}
                />
                <Text style={{ color: "#64748B", fontSize: 15 }}>
                  请先完成合规扫描
                </Text>
                <Text style={{ color: "#475569", fontSize: 12, marginTop: 4 }}>
                  在左侧输入货物信息并点击「开始合规扫描」
                </Text>
              </div>
            ) : (
              <>
                {/* ── 卡片 3：必需单证清单 ── */}
                <Card
                  title={<span style={{ color: "#F1F5F9" }}>必需单证清单</span>}
                  style={{ background: "#1E293B", borderColor: "#334155", marginBottom: 24 }}
                >
                  <List
                    dataSource={DOC_TYPES}
                    renderItem={(doc) => {
                      const canGenerate = !EXTERNAL_DOCS.includes(doc.key);
                      return (
                        <List.Item
                          style={{ borderColor: "#334155", padding: "12px 0" }}
                          actions={[
                            <Button
                              key="edit"
                              size="small"
                              type="link"
                              icon={<EditOutlined />}
                              onClick={() => handleSelectDoc(selectedDoc === doc.key ? null : doc.key)}
                            >
                              {selectedDoc === doc.key ? "关闭" : "预览/编辑"}
                            </Button>,
                            <Button
                              key="download"
                              size="small"
                              type="link"
                              icon={<DownloadOutlined />}
                              onClick={() => handleSelectDoc(doc.key)}
                            >
                              下载模板
                            </Button>,
                            !canGenerate ? (
                              <Button
                                key="assist"
                                size="small"
                                type="link"
                                icon={<SendOutlined />}
                                onClick={() => handleAssistClick(doc.label)}
                              >
                                协助办理
                              </Button>
                            ) : null,
                          ]}
                        >
                          <List.Item.Meta
                            avatar={
                              canGenerate ? (
                                <CheckCircleOutlined style={{ color: "#10B981", fontSize: 18 }} />
                              ) : (
                                <ExclamationCircleOutlined style={{ color: "#F59E0B", fontSize: 18 }} />
                              )
                            }
                            title={<span style={{ color: "#F1F5F9" }}>{doc.label}</span>}
                            description={
                              <Text style={{ color: "#64748B", fontSize: 12 }}>
                                {canGenerate ? "可在线上传信息后自动生成" : "需联系顾问协助办理"}
                              </Text>
                            }
                          />
                        </List.Item>
                      );
                    }}
                  />
                </Card>

                {/* ── 卡片 4：智能填单区 ── */}
                <Card
                  title={
                    selectedDoc && docTemplate ? (
                      <span style={{ color: "#F1F5F9" }}>{docTemplate.title}</span>
                    ) : (
                      <span style={{ color: "#64748B" }}>智能填单区</span>
                    )
                  }
                  style={{ background: "#1E293B", borderColor: "#334155" }}
                >
                  {templateLoading && (
                    <div style={{ textAlign: "center", padding: 32 }}>
                      <Spin />
                    </div>
                  )}

                  {!selectedDoc && !templateLoading && (
                    <div style={{ textAlign: "center", padding: "32px 0" }}>
                      <FileTextOutlined style={{ fontSize: 36, color: "#334155" }} />
                      <div style={{ color: "#64748B", marginTop: 12 }}>
                        请从上方选择单证类型开始填写
                      </div>
                    </div>
                  )}

                  {docTemplate && selectedDoc && (
                    <Form
                      layout="vertical"
                      onFinish={handleGenerate}
                      initialValues={docFormData}
                    >
                      <Row gutter={[16, 0]}>
                        {docTemplate.fields.map((field) => (
                          <Col xs={24} sm={12} md={8} key={field.name}>
                            <Form.Item
                              label={
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 4,
                                  }}
                                >
                                  <Text style={{ color: "#94A3B8", fontSize: 12 }}>
                                    {field.label}
                                    {field.required && (
                                      <span style={{ color: "#EF4444" }}> *</span>
                                    )}
                                  </Text>
                                  <Tooltip title="AI 自动填充">
                                    <BulbOutlined
                                      style={{
                                        color: "#F59E0B",
                                        cursor: "pointer",
                                        fontSize: 13,
                                        opacity: 0.7,
                                      }}
                                      onClick={() => handleAiFill(field.name)}
                                    />
                                  </Tooltip>
                                </div>
                              }
                              name={field.name}
                              rules={
                                field.required
                                  ? [{ required: true, message: `请输入${field.label}` }]
                                  : []
                              }
                            >
                              {renderDocField(field)}
                            </Form.Item>
                          </Col>
                        ))}
                      </Row>

                      <Divider
                        style={{ borderColor: "#334155", margin: "16px 0" }}
                      />

                      {/* 底部按钮组 */}
                      <Space
                        style={{ width: "100%", justifyContent: "flex-end" }}
                      >
                        <Button
                          icon={<SaveOutlined />}
                          onClick={() => message.success("草稿已保存")}
                        >
                          保存草稿
                        </Button>
                        <Button
                          type="primary"
                          icon={<DownloadOutlined />}
                          htmlType="submit"
                          loading={generating}
                        >
                          生成 PDF
                        </Button>
                        <Button
                          icon={<SendOutlined />}
                          onClick={() => {
                            message.success("已提交审核，顾问将尽快联系您");
                          }}
                        >
                          提交审核
                        </Button>
                      </Space>
                    </Form>
                  )}

                  {/* ══ 协助办理 Modal ══ */}
                  <Modal
                    title="转交顾问处理"
                    open={assistModalOpen}
                    onOk={handleAssistConfirm}
                    onCancel={() => setAssistModalOpen(false)}
                    okText="确认转交"
                    cancelText="取消"
                    okButtonProps={{ danger: false }}
                  >
                    <p style={{ color: "#94A3B8", margin: 0 }}>
                      「{assistDocType}」需要专业机构办理，是否转交顾问处理？
                    </p>
                    <p style={{ color: "#64748B", fontSize: 12, marginTop: 8 }}>
                      转交后，您可以在「工作台」页面查看办理进度和顾问回复。
                    </p>
                  </Modal>
                </Card>
              </>
            )}
          </Col>
        </Row>
      </div>
    </div>
  );
};

export default CompliancePage;
