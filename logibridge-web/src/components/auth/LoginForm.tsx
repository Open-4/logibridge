/**
 * LoginForm.tsx — 登录表单组件
 * 玻璃拟态卡片内的登录表单，使用 useAuthStore 管理状态
 */

import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Form, Input, Button, Typography } from "antd";
import { MailOutlined, LockOutlined } from "@ant-design/icons";
import { useAuthStore } from "../../store/useAuthStore";

const { Text } = Typography;

interface LoginFormValues {
  email: string;
  password: string;
}

const LoginForm: React.FC = () => {
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const [form] = Form.useForm<LoginFormValues>();
  const { login, loading } = useAuthStore();

  const handleSubmit = async (values: LoginFormValues) => {
    setError(null);
    try {
      await login(values.email, values.password);
      navigate("/", { replace: true });
    } catch (err: any) {
      const detail =
        err?.response?.data?.detail ||
        err?.message ||
        "登录失败，请稍后重试";
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
        登录
      </Text>
      <Text
        style={{
          fontSize: 14,
          color: "#64748B",
          display: "block",
          marginBottom: 28,
        }}
      >
        欢迎使用 LogiBridge 智能报关系统
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
          autoComplete="current-password"
          style={{
            background: "rgba(30,41,59,0.6)",
            border: "1px solid #334155",
            borderRadius: 8,
            color: "#F1F5F9",
            height: 44,
          }}
        />
      </Form.Item>

      {/* 登录按钮 */}
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
          登 录
        </Button>
      </Form.Item>

      {/* 注册链接 */}
      <div style={{ textAlign: "center", marginTop: 8 }}>
        <Text style={{ color: "#64748B", fontSize: 14 }}>
          还没有账号？{" "}
          <Link
            to="/register"
            style={{ color: "#3B82F6", fontWeight: 600 }}
          >
            立即注册
          </Link>
        </Text>
      </div>
    </Form>
  );
};

export default LoginForm;
