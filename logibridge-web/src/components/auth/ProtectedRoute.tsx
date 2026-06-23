/**
 * ProtectedRoute.tsx — 登录守卫路由组件
 *
 * 从 useAuthStore 检查 token 和 user：
 * - 初始化中 → 全屏加载动画
 * - 未登录 → 重定向 /login（携带来源路径）
 * - 已登录 → 渲染 children
 */

import { Spin } from "antd";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../../store/useAuthStore";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const location = useLocation();
  const { token, loading } = useAuthStore();

  // 初始化中 → 全屏 Spin
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

  // 未登录 → 跳转登录页，记住从哪来的
  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 已登录 → 渲染子组件
  return <>{children}</>;
};

export default ProtectedRoute;
