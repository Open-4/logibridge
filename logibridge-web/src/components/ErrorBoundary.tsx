import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button, Typography, Space } from "antd";
import { WarningOutlined, ReloadOutlined, HomeOutlined } from "@ant-design/icons";

const { Text, Title } = Typography;

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#0F172A",
            padding: 24,
          }}
        >
          <div style={{ textAlign: "center", maxWidth: 420 }}>
            <WarningOutlined style={{ fontSize: 56, color: "#EF4444", marginBottom: 16 }} />
            <Title level={3} style={{ color: "#F1F5F9", marginBottom: 8 }}>
              页面出现了异常
            </Title>
            <Text style={{ color: "#94A3B8", display: "block", marginBottom: 4 }}>
              {this.state.error?.message || "应用遇到了意外错误"}
            </Text>
            <Text style={{ color: "#64748B", fontSize: 12, display: "block", marginBottom: 24 }}>
              请尝试刷新页面，如问题持续存在请联系技术支持
            </Text>
            <Space size={12}>
              <Button
                type="primary"
                icon={<ReloadOutlined />}
                onClick={this.handleReset}
              >
                重试
              </Button>
              <Button
                icon={<HomeOutlined />}
                onClick={() => {
                  this.handleReset();
                  window.location.href = "/";
                }}
              >
                返回首页
              </Button>
            </Space>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
