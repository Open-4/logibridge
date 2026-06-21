import { ConfigProvider, theme } from "antd";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import AppLayout from "./components/layout/AppLayout";
import SmartPlanPage from "./pages/SmartPlanPage";
import CompliancePage from "./pages/CompliancePage";
import ControlTowerPage from "./pages/ControlTowerPage";
import ShipmentsPage from "./pages/ShipmentsPage";
import ConsultationPage from "./pages/ConsultationPage";
import "./styles/global.css";

const { darkAlgorithm } = theme;

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
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<SmartPlanPage />} />
            <Route path="/compliance" element={<CompliancePage />} />
            <Route path="/control-tower" element={<ControlTowerPage />} />
            <Route path="/shipments" element={<ShipmentsPage />} />
            <Route path="/consultation" element={<ConsultationPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
}

export default App;
