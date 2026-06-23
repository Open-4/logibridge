/**
 * LoginPage.tsx — 登录页
 * 左侧品牌插画 + 右侧玻璃拟态登录卡片
 */

import LoginForm from "../components/auth/LoginForm";
import bannerImg from "../assets/images/banner.png";

const LoginPage: React.FC = () => {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "radial-gradient(ellipse at 30% 20%, rgba(59,130,246,0.10) 0%, transparent 60%), radial-gradient(ellipse at 70% 80%, rgba(139,92,246,0.08) 0%, transparent 60%), #0F172A",
        padding: 24,
      }}
    >
      <div
        style={{
          display: "flex",
          maxWidth: 880,
          width: "100%",
          minHeight: 500,
          borderRadius: 20,
          overflow: "hidden",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          background: "rgba(15,23,42,0.60)",
          border: "1px solid rgba(51,65,85,0.50)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.40), 0 0 0 1px rgba(59,130,246,0.05)",
        }}
      >
        {/* 左侧：品牌插画 */}
        <div
          style={{
            flex: "0 0 400px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 40,
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* 装饰光晕 */}
          <div
            style={{
              position: "absolute",
              top: -60,
              left: -60,
              width: 240,
              height: 240,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(59,130,246,0.15) 0%, transparent 70%)",
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: -80,
              right: -40,
              width: 300,
              height: 300,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(139,92,246,0.10) 0%, transparent 70%)",
              pointerEvents: "none",
            }}
          />

          {/* 插画 */}
          <img
            src={bannerImg}
            alt="LogiBridge"
            style={{
              width: "100%",
              maxWidth: 320,
              height: "auto",
              position: "relative",
              zIndex: 1,
            }}
          />

          {/* 标语 */}
          <div style={{ textAlign: "center", position: "relative", zIndex: 1, marginTop: 8 }}>
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: "#F1F5F9",
                marginBottom: 6,
              }}
            >
              LogiBridge
            </div>
            <div
              style={{
                fontSize: 13,
                color: "#64748B",
                lineHeight: 1.6,
              }}
            >
              智能报关 · 全球物流合规平台
            </div>
          </div>
        </div>

        {/* 分隔线 */}
        <div
          style={{
            width: 1,
            background: "linear-gradient(to bottom, transparent, #334155, transparent)",
            margin: "32px 0",
          }}
        />

        {/* 右侧：表单 */}
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "40px 48px",
          }}
        >
          <LoginForm />
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
