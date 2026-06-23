/**
 * ProfilePage.tsx — 个人中心页
 *
 * Tab 1: 基本信息 — 头像、姓名、邮箱（只读）、公司、手机号
 * Tab 2: API Keys — 列表 + 新建/删除
 * Tab 3: 全局偏好 — 语言/货币/贸易术语/通知偏好
 */

import { useEffect, useState, useCallback } from "react";
import {
  Tabs,
  Card,
  Avatar,
  Upload,
  Button,
  Input,
  Form,
  Select,
  Checkbox,
  Table,
  Modal,
  Tag,
  Typography,
  message,
  Space,
  Tooltip,
  Empty,
  Popconfirm,
} from "antd";
import {
  UserOutlined,
  UploadOutlined,
  PlusOutlined,
  DeleteOutlined,
  KeyOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  CopyOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useAuthStore } from "../store/useAuthStore";
import {
  getSettingsApi,
  updateSettingsApi,
  createApiKeyApi,
  listApiKeysApi,
  deleteApiKeyApi,
} from "../api/userApi";
import type { UserSettings, ApiKey } from "../api/userApi";

const { Text, Title } = Typography;

// ── 常量 ──────────────────────────────────────────────────────────────

const LANGUAGES = [
  { value: "zh-CN", label: "中文" },
  { value: "en", label: "English" },
];

const CURRENCIES = [
  { value: "USD", label: "USD (美元)" },
  { value: "CNY", label: "CNY (人民币)" },
  { value: "EUR", label: "EUR (欧元)" },
  { value: "GBP", label: "GBP (英镑)" },
  { value: "JPY", label: "JPY (日元)" },
];

const INCOTERMS = [
  "EXW",
  "FCA",
  "FAS",
  "FOB",
  "CFR",
  "CIF",
  "CPT",
  "CIP",
  "DAP",
  "DPU",
  "DDP",
];

const CHECKBOX_STYLE: React.CSSProperties = {
  marginBottom: 0,
  padding: "8px 12px",
  borderRadius: 8,
  background: "rgba(30,41,59,0.4)",
  border: "1px solid #1E293B",
};

const CARD_STYLE: React.CSSProperties = {
  background: "rgba(15,23,42,0.6)",
  border: "1px solid #1E293B",
  borderRadius: 12,
  boxShadow: "0 2px 12px rgba(0,0,0,0.2)",
};

// ── ProfilePage ───────────────────────────────────────────────────────

const ProfilePage: React.FC = () => {
  const { user } = useAuthStore();

  // ── Tab 1: 基础信息 ─────────────────────────────────────────────
  const [name, setName] = useState(user?.name ?? "");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [profileDirty, setProfileDirty] = useState(false);

  // ── Tab 2: API Keys ─────────────────────────────────────────────
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [keysLoading, setKeysLoading] = useState(false);
  const [newKeyModalOpen, setNewKeyModalOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [generatedKey, setGeneratedKey] = useState<ApiKey | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());

  // ── Tab 3: 全局偏好 ─────────────────────────────────────────────
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // ── 加载设置 ────────────────────────────────────────────────────
  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const data = await getSettingsApi();
      setSettings(data);
    } catch {
      message.error("加载设置失败");
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  // ── 加载 API Keys ───────────────────────────────────────────────
  const loadApiKeys = useCallback(async () => {
    setKeysLoading(true);
    try {
      const data = await listApiKeysApi();
      setApiKeys(data);
    } catch {
      message.error("加载 API Keys 失败");
    } finally {
      setKeysLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
    loadApiKeys();
  }, [loadSettings, loadApiKeys]);

  // ── 保存设置 ────────────────────────────────────────────────────
  const handleSaveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const updated = await updateSettingsApi(settings);
      setSettings(updated);
      message.success("设置已保存");
    } catch {
      message.error("保存设置失败");
    } finally {
      setSaving(false);
    }
  };

  // ── 创建 API Key ────────────────────────────────────────────────
  const handleCreateKey = async () => {
    try {
      const key = await createApiKeyApi(newKeyName || undefined);
      setGeneratedKey(key);
      await loadApiKeys();
      message.success("API Key 已生成");
    } catch {
      message.error("生成 API Key 失败");
    }
  };

  // ── 删除 API Key ────────────────────────────────────────────────
  const handleDeleteKey = async (keyId: string) => {
    try {
      await deleteApiKeyApi(keyId);
      await loadApiKeys();
      message.success("API Key 已删除");
    } catch {
      message.error("删除失败");
    }
  };

  // ── 复制 key ────────────────────────────────────────────────────
  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key).then(() => {
      message.success("已复制到剪贴板");
    });
  };

  // ── 切换 key 可见 ───────────────────────────────────────────────
  const toggleKeyVisibility = (keyId: string) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(keyId)) next.delete(keyId);
      else next.add(keyId);
      return next;
    });
  };

  // ── API Keys 表格列 ─────────────────────────────────────────────
  const keyColumns: ColumnsType<ApiKey> = [
    {
      title: "名称",
      dataIndex: "name",
      key: "name",
      render: (name: string) => (
        <Space>
          <KeyOutlined style={{ color: "#3B82F6" }} />
          <Text style={{ color: "#F1F5F9", fontWeight: 500 }}>{name}</Text>
        </Space>
      ),
    },
    {
      title: "API Key",
      dataIndex: "key",
      key: "key",
      width: 280,
      render: (key: string, record: ApiKey) => {
        const isVisible = visibleKeys.has(record.id);
        const display = isVisible ? key : `${key.slice(0, 12)}••••••`;
        return (
          <Space>
            <Text
              code
              style={{
                color: "#94A3B8",
                fontSize: 12,
                background: "rgba(30,41,59,0.6)",
                border: "1px solid #334155",
                padding: "2px 8px",
                borderRadius: 4,
                fontFamily: "monospace",
              }}
            >
              {display}
            </Text>
            <Tooltip title={isVisible ? "隐藏" : "显示"}>
              <Button
                type="text"
                size="small"
                icon={isVisible ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                style={{ color: "#64748B" }}
                onClick={() => toggleKeyVisibility(record.id)}
              />
            </Tooltip>
            <Tooltip title="复制">
              <Button
                type="text"
                size="small"
                icon={<CopyOutlined />}
                style={{ color: "#64748B" }}
                onClick={() => handleCopyKey(key)}
              />
            </Tooltip>
          </Space>
        );
      },
    },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 160,
      render: (t: string) => (
        <Text style={{ color: "#94A3B8", fontSize: 13 }}>
          {dayjs(t).format("YYYY-MM-DD HH:mm")}
        </Text>
      ),
    },
    {
      title: "最后使用",
      dataIndex: "lastUsedAt",
      key: "lastUsedAt",
      width: 160,
      render: (t: string | null) =>
        t ? (
          <Text style={{ color: "#94A3B8", fontSize: 13 }}>
            {dayjs(t).format("YYYY-MM-DD HH:mm")}
          </Text>
        ) : (
          <Tag
            style={{
              fontSize: 11,
              borderRadius: 4,
              background: "rgba(100,116,139,0.15)",
              border: "none",
              color: "#64748B",
            }}
          >
            未使用
          </Tag>
        ),
    },
    {
      title: "操作",
      key: "action",
      width: 80,
      render: (_: unknown, record: ApiKey) => (
        <Popconfirm
          title="确定删除此 API Key？"
          description="删除后无法恢复，使用该 Key 的应用将立即失效。"
          onConfirm={() => handleDeleteKey(record.id)}
          okText="删除"
          cancelText="取消"
          okButtonProps={{ danger: true }}
          placement="left"
        >
          <Button
            type="text"
            size="small"
            danger
            icon={<DeleteOutlined />}
          />
        </Popconfirm>
      ),
    },
  ];

  // ── 设置改变 ────────────────────────────────────────────────────
  const updateSetting = <K extends keyof UserSettings>(
    key: K,
    value: UserSettings[K],
  ) => {
    if (!settings) return;
    setSettings({ ...settings, [key]: value });
  };

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 24px 60px" }}>
      <Title level={3} style={{ color: "#F1F5F9", marginBottom: 24 }}>
        个人中心
      </Title>

      <Tabs
        defaultActiveKey="profile"
        tabBarStyle={{ color: "#94A3B8" }}
        items={[
          // ════════════════════════════════════════════════════════════
          //  Tab 1: 基本信息
          // ════════════════════════════════════════════════════════════
          {
            key: "profile",
            label: (
              <Space>
                <UserOutlined /> 基本信息
              </Space>
            ),
            children: (
              <div style={{ maxWidth: 520 }}>
                {/* 头像 */}
                <Card style={CARD_STYLE}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 20,
                    }}
                  >
                    <Avatar
                      size={72}
                      icon={<UserOutlined />}
                      style={{
                        backgroundColor: "#334155",
                        border: "2px solid #3B82F6",
                        flexShrink: 0,
                      }}
                    />
                    <Upload
                      accept="image/*"
                      showUploadList={false}
                      beforeUpload={(file) => {
                        message.info("头像上传功能将在后续版本开放");
                        return false;
                      }}
                    >
                      <Button
                        icon={<UploadOutlined />}
                        style={{
                          borderRadius: 8,
                          borderColor: "#334155",
                          color: "#94A3B8",
                        }}
                      >
                        更换头像
                      </Button>
                    </Upload>
                  </div>
                </Card>

                <Card style={{ ...CARD_STYLE, marginTop: 16 }}>
                  <Space
                    direction="vertical"
                    size={16}
                    style={{ width: "100%" }}
                  >
                    {/* 姓名 */}
                    <div>
                      <Text
                        style={{
                          color: "#94A3B8",
                          fontSize: 13,
                          display: "block",
                          marginBottom: 6,
                        }}
                      >
                        姓名
                      </Text>
                      <Input
                        value={name}
                        onChange={(e) => {
                          setName(e.target.value);
                          setProfileDirty(true);
                        }}
                        style={{
                          background: "rgba(30,41,59,0.6)",
                          border: "1px solid #334155",
                          borderRadius: 8,
                          color: "#F1F5F9",
                          height: 40,
                        }}
                      />
                    </div>

                    {/* 邮箱（只读） */}
                    <div>
                      <Text
                        style={{
                          color: "#94A3B8",
                          fontSize: 13,
                          display: "block",
                          marginBottom: 6,
                        }}
                      >
                        邮箱
                      </Text>
                      <Input
                        value={user?.email ?? ""}
                        readOnly
                        style={{
                          background: "rgba(30,41,59,0.3)",
                          border: "1px solid #1E293B",
                          borderRadius: 8,
                          color: "#64748B",
                          height: 40,
                        }}
                      />
                    </div>

                    {/* 公司名称 */}
                    <div>
                      <Text
                        style={{
                          color: "#94A3B8",
                          fontSize: 13,
                          display: "block",
                          marginBottom: 6,
                        }}
                      >
                        公司名称
                      </Text>
                      <Input
                        value={company}
                        onChange={(e) => {
                          setCompany(e.target.value);
                          setProfileDirty(true);
                        }}
                        placeholder="选填"
                        style={{
                          background: "rgba(30,41,59,0.6)",
                          border: "1px solid #334155",
                          borderRadius: 8,
                          color: "#F1F5F9",
                          height: 40,
                        }}
                      />
                    </div>

                    {/* 手机号 */}
                    <div>
                      <Text
                        style={{
                          color: "#94A3B8",
                          fontSize: 13,
                          display: "block",
                          marginBottom: 6,
                        }}
                      >
                        手机号
                      </Text>
                      <Input
                        value={phone}
                        onChange={(e) => {
                          setPhone(e.target.value);
                          setProfileDirty(true);
                        }}
                        placeholder="选填"
                        style={{
                          background: "rgba(30,41,59,0.6)",
                          border: "1px solid #334155",
                          borderRadius: 8,
                          color: "#F1F5F9",
                          height: 40,
                        }}
                      />
                    </div>

                    {/* 保存按钮 */}
                    <Button
                      type="primary"
                      disabled={!profileDirty}
                      onClick={() => {
                        message.success("基本信息已保存（MVP 阶段仅前端缓存）");
                        setProfileDirty(false);
                      }}
                      style={{
                        borderRadius: 8,
                        height: 40,
                        width: 120,
                      }}
                    >
                      保存
                    </Button>
                  </Space>
                </Card>
              </div>
            ),
          },

          // ════════════════════════════════════════════════════════════
          //  Tab 2: API Keys
          // ════════════════════════════════════════════════════════════
          {
            key: "api-keys",
            label: (
              <Space>
                <KeyOutlined /> API Keys
              </Space>
            ),
            children: (
              <div>
                {/* 新建按钮 */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 16,
                  }}
                >
                  <Text style={{ color: "#94A3B8", fontSize: 14 }}>
                    管理你的 API 访问密钥
                  </Text>
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => {
                      setNewKeyName("");
                      setGeneratedKey(null);
                      setNewKeyModalOpen(true);
                    }}
                    style={{ borderRadius: 8, height: 36 }}
                  >
                    新建 API Key
                  </Button>
                </div>

                {/* 表格 */}
                <Table
                  dataSource={apiKeys}
                  columns={keyColumns}
                  rowKey="id"
                  loading={keysLoading}
                  pagination={false}
                  locale={{
                    emptyText: (
                      <Empty
                        description={
                          <Text style={{ color: "#64748B" }}>
                            暂无 API Key
                          </Text>
                        }
                      />
                    ),
                  }}
                  style={{ borderRadius: 12, overflow: "hidden" }}
                />

                {/* 新建 API Key Modal */}
                <Modal
                  title={
                    <Text style={{ color: "#F1F5F9", fontWeight: 600 }}>
                      {generatedKey ? "API Key 已生成" : "新建 API Key"}
                    </Text>
                  }
                  open={newKeyModalOpen}
                  onCancel={() => {
                    setNewKeyModalOpen(false);
                    setGeneratedKey(null);
                  }}
                  footer={
                    generatedKey
                      ? [
                          <Button
                            key="copy"
                            type="primary"
                            icon={<CopyOutlined />}
                            onClick={() => handleCopyKey(generatedKey.key)}
                            style={{ borderRadius: 8 }}
                          >
                            复制 Key
                          </Button>,
                          <Button
                            key="close"
                            onClick={() => {
                              setNewKeyModalOpen(false);
                              setGeneratedKey(null);
                            }}
                            style={{ borderRadius: 8 }}
                          >
                            关闭
                          </Button>,
                        ]
                      : [
                          <Button
                            key="cancel"
                            onClick={() => setNewKeyModalOpen(false)}
                            style={{ borderRadius: 8 }}
                          >
                            取消
                          </Button>,
                          <Button
                            key="create"
                            type="primary"
                            onClick={handleCreateKey}
                            style={{ borderRadius: 8 }}
                          >
                            生成
                          </Button>,
                        ]
                  }
                  styles={{
                    content: {
                      background: "#0F172A",
                      border: "1px solid #1E293B",
                      borderRadius: 12,
                    },
                    header: {
                      background: "transparent",
                      borderBottom: "1px solid #1E293B",
                      paddingBottom: 16,
                    },
                  }}
                  width={520}
                >
                  {generatedKey ? (
                    <div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          marginBottom: 12,
                        }}
                      >
                        <CheckCircleOutlined
                          style={{ color: "#22C55E", fontSize: 20 }}
                        />
                        <Text style={{ color: "#F1F5F9", fontSize: 15 }}>
                          请立即复制并安全保存此 Key
                        </Text>
                      </div>
                      <Text
                        style={{
                          color: "#94A3B8",
                          fontSize: 13,
                          display: "block",
                          marginBottom: 8,
                        }}
                      >
                        关闭对话框后将无法再次查看完整 Key。
                      </Text>

                      {/* 完整 key 展示 */}
                      <div
                        style={{
                          background: "rgba(30,41,59,0.6)",
                          border: "1px solid #3B82F6",
                          borderRadius: 8,
                          padding: "12px 16px",
                          fontFamily: "monospace",
                          fontSize: 13,
                          color: "#F1F5F9",
                          wordBreak: "break-all",
                          marginBottom: 8,
                        }}
                      >
                        {generatedKey.key}
                      </div>

                      <Text
                        style={{
                          color: "#64748B",
                          fontSize: 12,
                          display: "block",
                        }}
                      >
                        名称: {generatedKey.name}
                      </Text>
                    </div>
                  ) : (
                    <div>
                      <Text
                        style={{
                          color: "#94A3B8",
                          fontSize: 13,
                          display: "block",
                          marginBottom: 12,
                        }}
                      >
                        为 API Key 输入一个易识别的名称：
                      </Text>
                      <Input
                        value={newKeyName}
                        onChange={(e) => setNewKeyName(e.target.value)}
                        placeholder='例如："开发环境"、"生产环境"'
                        autoFocus
                        style={{
                          background: "rgba(30,41,59,0.6)",
                          border: "1px solid #334155",
                          borderRadius: 8,
                          color: "#F1F5F9",
                          height: 40,
                        }}
                      />
                    </div>
                  )}
                </Modal>
              </div>
            ),
          },

          // ════════════════════════════════════════════════════════════
          //  Tab 3: 全局偏好
          // ════════════════════════════════════════════════════════════
          {
            key: "preferences",
            label: (
              <Space>
                全局偏好
              </Space>
            ),
            children: settings ? (
              <div style={{ maxWidth: 560 }}>
                {/* 语言 */}
                <Card style={CARD_STYLE}>
                  <div style={{ marginBottom: 20 }}>
                    <Text
                      style={{
                        color: "#F1F5F9",
                        fontSize: 14,
                        fontWeight: 600,
                        display: "block",
                        marginBottom: 6,
                      }}
                    >
                      语言 / Language
                    </Text>
                    <Select
                      value={settings.language}
                      onChange={(v) => updateSetting("language", v)}
                      options={LANGUAGES}
                      style={{ width: "100%" }}
                      size="large"
                    />
                  </div>

                  {/* 默认货币 */}
                  <div style={{ marginBottom: 20 }}>
                    <Text
                      style={{
                        color: "#F1F5F9",
                        fontSize: 14,
                        fontWeight: 600,
                        display: "block",
                        marginBottom: 6,
                      }}
                    >
                      默认货币
                    </Text>
                    <Select
                      value={settings.currency}
                      onChange={(v) => updateSetting("currency", v)}
                      options={CURRENCIES}
                      style={{ width: "100%" }}
                      size="large"
                    />
                  </div>

                  {/* 默认贸易术语 */}
                  <div>
                    <Text
                      style={{
                        color: "#F1F5F9",
                        fontSize: 14,
                        fontWeight: 600,
                        display: "block",
                        marginBottom: 6,
                      }}
                    >
                      默认贸易术语 (Incoterms)
                    </Text>
                    <Select
                      value={settings.default_incoterm}
                      onChange={(v) => updateSetting("default_incoterm", v)}
                      options={INCOTERMS.map((t) => ({
                        value: t,
                        label: t,
                      }))}
                      style={{ width: "100%" }}
                      size="large"
                    />
                  </div>
                </Card>

                {/* 通知偏好 */}
                <Card
                  style={{ ...CARD_STYLE, marginTop: 16 }}
                  title={
                    <Text style={{ color: "#F1F5F9", fontWeight: 600 }}>
                      通知偏好
                    </Text>
                  }
                  styles={{
                    header: {
                      borderBottom: "1px solid #1E293B",
                      paddingBottom: 12,
                    },
                  }}
                >
                  <Space direction="vertical" size={12} style={{ width: "100%" }}>
                    <div style={CHECKBOX_STYLE}>
                      <Checkbox
                        checked={settings.notify_by_email}
                        onChange={(e) =>
                          updateSetting("notify_by_email", e.target.checked)
                        }
                        style={{ color: "#F1F5F9", width: "100%" }}
                      >
                        <Text style={{ color: "#F1F5F9" }}>邮件通知</Text>
                        <Text
                          style={{
                            color: "#64748B",
                            fontSize: 12,
                            display: "block",
                            marginTop: 2,
                          }}
                        >
                          通过邮件接收重要提醒
                        </Text>
                      </Checkbox>
                    </div>

                    <div style={CHECKBOX_STYLE}>
                      <Checkbox
                        checked={settings.notify_by_sms}
                        onChange={(e) =>
                          updateSetting("notify_by_sms", e.target.checked)
                        }
                        style={{ color: "#F1F5F9", width: "100%" }}
                      >
                        <Text style={{ color: "#F1F5F9" }}>短信推送</Text>
                        <Text
                          style={{
                            color: "#64748B",
                            fontSize: 12,
                            display: "block",
                            marginTop: 2,
                          }}
                        >
                          通过短信接收紧急通知
                        </Text>
                      </Checkbox>
                    </div>

                    <div style={CHECKBOX_STYLE}>
                      <Checkbox
                        checked={settings.notify_on_delay}
                        onChange={(e) =>
                          updateSetting("notify_on_delay", e.target.checked)
                        }
                        style={{ color: "#F1F5F9", width: "100%" }}
                      >
                        <Text style={{ color: "#F1F5F9" }}>风险预警邮件</Text>
                        <Text
                          style={{
                            color: "#64748B",
                            fontSize: 12,
                            display: "block",
                            marginTop: 2,
                          }}
                        >
                          货物延误、港口拥堵等风险事件发生时发送预警
                        </Text>
                      </Checkbox>
                    </div>

                    <div style={CHECKBOX_STYLE}>
                      <Checkbox
                        checked={false}
                        style={{ color: "#F1F5F9", width: "100%" }}
                      >
                        <Text style={{ color: "#94A3B8" }}>行业新闻</Text>
                        <Text
                          style={{
                            color: "#64748B",
                            fontSize: 12,
                            display: "block",
                            marginTop: 2,
                          }}
                        >
                          贸易政策变动、关税调整等资讯（即将上线）
                        </Text>
                      </Checkbox>
                    </div>
                  </Space>
                </Card>

                {/* 保存按钮 */}
                <div style={{ marginTop: 20 }}>
                  <Button
                    type="primary"
                    size="large"
                    loading={saving}
                    onClick={handleSaveSettings}
                    style={{
                      borderRadius: 8,
                      height: 40,
                      width: 140,
                      fontSize: 15,
                    }}
                  >
                    保存设置
                  </Button>
                </div>
              </div>
            ) : (
              <div
                style={{
                  textAlign: "center",
                  padding: 60,
                  color: "#64748B",
                }}
              >
                {settingsLoading ? "加载中..." : "暂无设置数据"}
              </div>
            ),
          },
        ]}
      />
    </div>
  );
};

export default ProfilePage;
