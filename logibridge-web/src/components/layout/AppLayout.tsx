import { useState, useRef } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { Menu, Badge, Avatar, Popover, List, Tag, Typography, Button, Empty, Space } from "antd";
import {
  BellOutlined,
  UserOutlined,
  ScheduleOutlined,
  SafetyOutlined,
  DashboardOutlined,
  CarryOutOutlined,
  ToolOutlined,
  RobotOutlined,
  CustomerServiceOutlined,
  CheckOutlined,
} from "@ant-design/icons";
import type { MenuProps } from "antd";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/zh-cn";
import logoImg from "../../assets/images/logo.png";
import { useConsultationNotifications } from "../../store/useConsultationNotifications";
import { useRole } from "../../store/useRoleStore";

dayjs.extend(relativeTime);
dayjs.locale("zh-cn");

const { Text } = Typography;

const menuItems: MenuProps["items"] = [
  { key: "/", icon: <ScheduleOutlined />, label: "方案推演" },
  { key: "/compliance", icon: <SafetyOutlined />, label: "合规体检" },
  { key: "/control-tower", icon: <DashboardOutlined />, label: "控制塔" },
  { key: "/shipments", icon: <CarryOutOutlined />, label: "在途货物" },
  { key: "/consultation", icon: <ToolOutlined />, label: "工作台" },
];

const CATEGORY_TAG_COLORS: Record<string, string> = {
  tariff: "gold",
  compliance: "orange",
  optimization: "blue",
  document: "purple",
  other: "default",
  freight: "blue",
  customs: "purple",
};

const AppLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { unreadCount, unreadItems, markAsRead, markAllAsRead } = useConsultationNotifications();
  const { isConsultant, toggleRole } = useRole();
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef<HTMLSpanElement>(null);

  const handleMenuClick: MenuProps["onClick"] = ({ key }) => {
    navigate(key);
  };

  const handleBellClick = () => {
    setBellOpen((prev) => !prev);
  };

  const handleNotificationClick = (item: (typeof unreadItems)[number]) => {
    markAsRead(item.consultationId);
    setBellOpen(false);
    navigate(`/consultation?id=${item.consultationId}`);
  };

  const getSenderIcon = (content: string): React.ReactNode => {
    // AI 回复通常包含 ** 等 Markdown 格式
    if (content.includes("**") || content.includes("合规要求") || content.includes("HS 编码")) {
      return <RobotOutlined style={{ color: "#60A5FA", fontSize: 12 }} />;
    }
    return <CustomerServiceOutlined style={{ color: "#A78BFA", fontSize: 12 }} />;
  };

  // 通知下拉内容
  const notificationContent = (
    <div style={{ width: 360, maxHeight: 420, display: "flex", flexDirection: "column" }}>
      {/* 标题栏 */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "10px 14px",
          borderBottom: "1px solid #1E293B",
        }}
      >
        <Text strong style={{ color: "#F1F5F9", fontSize: 14 }}>
          新消息通知
        </Text>
        {unreadItems.length > 0 && (
          <Button
            type="text"
            size="small"
            icon={<CheckOutlined />}
            onClick={() => { markAllAsRead(); setBellOpen(false); }}
            style={{ color: "#3B82F6", fontSize: 12 }}
          >
            全部已读
          </Button>
        )}
      </div>

      {/* 列表 */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {unreadItems.length === 0 ? (
          <div style={{ padding: 30 }}>
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={<Text style={{ color: "#64748B", fontSize: 13 }}>暂无新消息</Text>}
            />
          </div>
        ) : (
          unreadItems.map((item) => (
            <div
              key={item.consultationId}
              onClick={() => handleNotificationClick(item)}
              style={{
                padding: "10px 14px",
                cursor: "pointer",
                borderBottom: "1px solid rgba(30, 41, 59, 0.5)",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#1E293B"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                {/* 左侧图标 */}
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    background: "rgba(59,130,246,0.12)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    marginTop: 2,
                  }}
                >
                  {getSenderIcon(item.lastMessage)}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* 主题行 */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                    <Text strong style={{ color: "#F1F5F9", fontSize: 13, flex: 1 }} ellipsis>
                      {item.subject}
                    </Text>
                    <Text style={{ color: "#475569", fontSize: 11, flexShrink: 0, marginLeft: 8 }}>
                      {dayjs(item.lastMessageTime).fromNow()}
                    </Text>
                  </div>

                  {/* 分类 Tag */}
                  <Tag
                    color={CATEGORY_TAG_COLORS[item.category] || "default"}
                    style={{ fontSize: 10, lineHeight: "16px", padding: "0 4px", marginBottom: 4 }}
                  >
                    {item.category}
                  </Tag>

                  {/* 消息预览 */}
                  <Text style={{ color: "#94A3B8", fontSize: 12 }} ellipsis>
                    {item.lastMessage}
                  </Text>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 底部 "查看所有" */}
      {unreadItems.length > 0 && (
        <div
          style={{
            borderTop: "1px solid #1E293B",
            padding: "8px 14px",
            textAlign: "center",
          }}
        >
          <Button
            type="link"
            size="small"
            onClick={() => { setBellOpen(false); navigate("/consultation"); }}
            style={{ color: "#3B82F6", fontSize: 12 }}
          >
            查看所有咨询
          </Button>
        </div>
      )}
    </div>
  );

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
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* 角色切换指示器 */}
          {isConsultant && (
            <Tag
              color="purple"
              style={{ cursor: "pointer", fontSize: 11, lineHeight: "20px", marginRight: 0 }}
              onClick={toggleRole}
            >
              顾问模式
            </Tag>
          )}

          {/* 通知铃铛 */}
          <Popover
            content={notificationContent}
            trigger="click"
            open={bellOpen}
            onOpenChange={setBellOpen}
            placement="bottomRight"
            styles={{
              body: {
                padding: 0,
                background: "#0F172A",
                border: "1px solid #1E293B",
                borderRadius: 10,
              },
            }}
          >
            <span ref={bellRef} onClick={handleBellClick} style={{ cursor: "pointer", lineHeight: 0 }}>
              <Badge count={unreadCount} size="small" color="#EF4444" overflowCount={99}>
                <BellOutlined style={{ fontSize: 20, color: "#94A3B8" }} />
              </Badge>
            </span>
          </Popover>

          {/* 用户头像 */}
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
