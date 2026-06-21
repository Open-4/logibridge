import { useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { Menu, Badge, Avatar } from "antd";
import {
  BellOutlined,
  UserOutlined,
  ScheduleOutlined,
  SafetyOutlined,
  DashboardOutlined,
  CarryOutOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import type { MenuProps } from "antd";
import logoImg from "../../assets/images/logo.png";

const menuItems: MenuProps["items"] = [
  { key: "/", icon: <ScheduleOutlined />, label: "方案推演" },
  { key: "/compliance", icon: <SafetyOutlined />, label: "合规体检" },
  { key: "/control-tower", icon: <DashboardOutlined />, label: "控制塔" },
  { key: "/shipments", icon: <CarryOutOutlined />, label: "在途货物" },
  { key: "/consultation", icon: <ToolOutlined />, label: "工作台" },
];

const AppLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [hasNotif] = useState(true);

  const handleMenuClick: MenuProps["onClick"] = ({ key }) => {
    navigate(key);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* 顶部导航栏 */}
      <header
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: 56,
          zIndex: 1000,
          background: "#0F172A",
          borderBottom: "1px solid #1E293B",
          display: "flex",
          alignItems: "center",
          padding: "0 24px",
        }}
      >
        {/* 左侧 Logo */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginRight: 32,
            cursor: "pointer",
          }}
          onClick={() => navigate("/")}
        >
          <img src={logoImg} height={32} alt="LogiBridge" />
          <span
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: "#3B82F6",
              letterSpacing: "0.5px",
            }}
          >
            LogiBridge
          </span>
        </div>

        {/* 中间导航菜单 */}
        <Menu
          mode="horizontal"
          items={menuItems}
          onClick={handleMenuClick}
          selectedKeys={[location.pathname]}
          style={{
            flex: 1,
            background: "transparent",
            borderBottom: "none",
            minWidth: 0,
          }}
          theme="dark"
        />

        {/* 右侧操作区 */}
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <Badge dot={hasNotif} color="#EF4444">
            <BellOutlined style={{ fontSize: 20, color: "#94A3B8", cursor: "pointer" }} />
          </Badge>
          <Avatar
            size={32}
            icon={<UserOutlined />}
            style={{ backgroundColor: "#334155", cursor: "pointer" }}
          />
        </div>
      </header>

      {/* 主内容区（顶栏下方） */}
      <main style={{ marginTop: 56, flex: 1 }}>
        <Outlet />
      </main>
    </div>
  );
};

export default AppLayout;
