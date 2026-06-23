/**
 * RegisterForm.tsx — 注册表单组件，使用 useAuthStore 管理状态
 */

import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Form, Input, Button, Typography } from "antd";
import { MailOutlined, LockOutlined, UserOutlined, BankOutlined } from "@ant-design/icons";
import { useAuthStore } from "../../store/useAuthStore";

const { Text } = Typography;

interface RegisterFormValues {
  name: string;
  company?: string;
  email: string;
  password: string;
  confirmPassword: string;
}

const RegisterForm: React.FC = () => {
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const [form] = Form.useForm<RegisterFormValues>();
  const { register, loading } = useAuthStore();

  const handleSubmit = async (values: RegisterFormValues) => {
    setError(null);
    try {
      await register(values.email, values.password, values.name);
      navigate("/", { replace: true });
    } catch (err: any) {
      const detail =
        err?.response?.data?.detail ||
        err?.message ||
        "注册失败，请稍后重试";
      setError(detail);
    }
  };

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={handleSubmit}
      requiredMark={false}
      style={{ width: "100%" }}
      size="large"
    >
      {/* 标题 */}
      <Text
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: "#F1F5F9",
          display: "block",
          marginBottom: 4,
        }}
      >
        创建账号
      </Text>
      <Text
        style={{
          fontSize: 14,
          color: "#64748B",
          display: "block",
          marginBottom: 28,
        }}
      >
        注册 LogiBridge 账号，开始智能报关之旅
      </Text>

      {/* 错误提示 */}
      {error && (
        <div
          style={{
            background: "rgba(239,68,68,0.12)",
            border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: 8,
            padding: "8px 14px",
            marginBottom: 16,
            color: "#FCA5A5",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {/* 姓名 */}
      <Form.Item
        name="name"
        rules={[
          { required: true, message: "请输入姓名" },
          { min: 1, max: 50, message: "姓名长度 1-50 个字符" },
        ]}
      >
        <Input
          prefix={<UserOutlined style={{ color: "#64748B" }} />}
          placeholder="姓名"
          autoComplete="name"
          style={{
            background: "rgba(30,41,59,0.6)",
            border: "1px solid #334155",
            borderRadius: 8,
            color: "#F1F5F9",
            height: 44,
          }}
        />
      </Form.Item>

      {/* 公司名称（可选） */}
      <Form.Item name="company">
        <Input
          prefix={<BankOutlined style={{ color: "#64748B" }} />}
          placeholder="公司名称（可选）"
          style={{
            background: "rgba(30,41,59,0.6)",
            border: "1px solid #334155",
            borderRadius: 8,
            color: "#F1F5F9",
            height: 44,
          }}
        />
      </Form.Item>

      {/* 邮箱 */}
      <Form.Item
        name="email"
        rules={[
          { required: true, message: "请输入邮箱" },
          { type: "email", message: "邮箱格式不正确" },
        ]}
      >
        <Input
          prefix={<MailOutlined style={{ color: "#64748B" }} />}
          placeholder="邮箱地址"
          autoComplete="email"
          style={{
            background: "rgba(30,41,59,0.6)",
            border: "1px solid #334155",
            borderRadius: 8,
            color: "#F1F5F9",
            height: 44,
          }}
        />
      </Form.Item>

      {/* 密码 */}
      <Form.Item
        name="password"
        rules={[
          { required: true, message: "请输入密码" },
          { min: 8, message: "密码长度不能少于 8 位" },
        ]}
      >
        <Input.Password
          prefix={<LockOutlined style={{ color: "#64748B" }} />}
          placeholder="密码"
          autoComplete="new-password"
          style={{
            background: "rgba(30,41,59,0.6)",
            border: "1px solid #334155",
            borderRadius: 8,
            color: "#F1F5F9",
            height: 44,
          }}
        />
      </Form.Item>

      {/* 确认密码 */}
      <Form.Item
        name="confirmPassword"
        dependencies={["password"]}
        rules={[
          { required: true, message: "请再次输入密码" },
          ({ getFieldValue }) => ({
            validator(_, value) {
              if (!value || getFieldValue("password") === value) {
                return Promise.resolve();
              }
              return Promise.reject(new Error("两次输入的密码不一致"));
            },
          }),
        ]}
      >
        <Input.Password
          prefix={<LockOutlined style={{ color: "#64748B" }} />}
          placeholder="确认密码"
          autoComplete="new-password"
          style={{
            background: "rgba(30,41,59,0.6)",
            border: "1px solid #334155",
            borderRadius: 8,
            color: "#F1F5F9",
            height: 44,
          }}
        />
      </Form.Item>

      {/* 注册按钮 */}
      <Form.Item style={{ marginTop: 8 }}>
        <Button
          type="primary"
          htmlType="submit"
          loading={loading}
          block
          style={{
            height: 44,
            borderRadius: 8,
            fontSize: 16,
            fontWeight: 600,
            border: "none",
            background: "linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)",
            boxShadow: "0 4px 14px rgba(59,130,246,0.35)",
          }}
        >
          注 册
        </Button>
      </Form.Item>

      {/* 登录链接 */}
      <div style={{ textAlign: "center", marginTop: 8 }}>
        <Text style={{ color: "#64748B", fontSize: 14 }}>
          已有账号？{" "}
          <Link
            to="/login"
            style={{ color: "#3B82F6", fontWeight: 600 }}
          >
            立即登录
          </Link>
        </Text>
      </div>
    </Form>
  );
};

export default RegisterForm;
