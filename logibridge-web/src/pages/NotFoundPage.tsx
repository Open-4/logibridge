import { useNavigate } from "react-router-dom";
import { Button, Typography, Space } from "antd";
import { HomeOutlined, QuestionCircleOutlined } from "@ant-design/icons";

const { Text, Title } = Typography;

const NotFoundPage: React.FC = () => {
  const navigate = useNavigate();

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
        <QuestionCircleOutlined style={{ fontSize: 64, color: "#334155", marginBottom: 16 }} />
        <Title level={2} style={{ color: "#F1F5F9", marginBottom: 4, fontSize: 48 }}>
          404
        </Title>
        <Title level={4} style={{ color: "#94A3B8", margin: "0 0 8px", fontWeight: 400 }}>
          页面未找到
        </Title>
        <Text style={{ color: "#64748B", display: "block", marginBottom: 32 }}>
          您访问的页面不存在或已被移除
        </Text>
        <Space size={12}>
          <Button
            type="primary"
            size="large"
            icon={<HomeOutlined />}
            onClick={() => navigate("/")}
          >
            返回首页
          </Button>
        </Space>
      </div>
    </div>
  );
};

export default NotFoundPage;
