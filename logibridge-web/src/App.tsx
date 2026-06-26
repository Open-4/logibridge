import { useEffect } from "react";
import { ConfigProvider, theme, Spin } from "antd";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "./components/layout/AppLayout";
import SmartPlanPage from "./pages/SmartPlanPage";
import CompliancePage from "./pages/CompliancePage";
import ControlTowerPage from "./pages/ControlTowerPage";
import ShipmentsPage from "./pages/ShipmentsPage";
import ConsultationPage from "./pages/ConsultationPage";
import AdminConsultationsPage from "./pages/AdminConsultationsPage";
import ProfilePage from "./pages/ProfilePage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import ErrorBoundary from "./components/ErrorBoundary";
import NotFoundPage from "./pages/NotFoundPage";
import { useAuthStore } from "./store/useAuthStore";
import "./styles/global.css";

const { darkAlgorithm } = theme;

/** 已登录用户访问公开路由（登录/注册）时重定向到首页 */
function GuestRoute({ children }: { children: React.ReactNode }) {
  const { token, loading } = useAuthStore();

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0F172A",
        }}
      >
        <Spin size="large" />
      </div>
    );
  }

  if (token) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

/** App 内部组件，负责初始化 auth */
function AppInner() {
  const init = useAuthStore((s) => s.init);

  useEffect(() => {
    init();
  }, [init]);

  return (
    <Routes>
      {/* 公开路由 */}
      <Route
        path="/login"
        element={
          <GuestRoute>
            <LoginPage />
          </GuestRoute>
        }
      />
      <Route
        path="/register"
        element={
          <GuestRoute>
            <RegisterPage />
          </GuestRoute>
        }
      />

      {/* 受保护路由 — 用 ProtectedRoute 包裹 */}
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<SmartPlanPage />} />
        <Route path="/compliance" element={<CompliancePage />} />
        <Route path="/control-tower" element={<ControlTowerPage />} />
        <Route path="/shipments" element={<ShipmentsPage />} />
        <Route path="/consultation" element={<ConsultationPage />} />
        <Route path="/admin/consultations" element={<AdminConsultationsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
      </Route>

      {/* 404 页面 */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

function App() {
  return (
    <ConfigProvider
      theme={{
        algorithm: darkAlgorithm,
        token: {
          colorPrimary: "#3B82F6",
          borderRadius: 6,
        },
      }}
    >
      <BrowserRouter>
        <AppInner />
      </BrowserRouter>
    </ConfigProvider>
  );
}

export default App;
