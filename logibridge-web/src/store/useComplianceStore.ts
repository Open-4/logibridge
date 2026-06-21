/**
 * useComplianceStore.ts — 合规体检页面状态管理
 */

import { create } from "zustand";
import { message } from "antd";
import { scanCompliance as scanComplianceApi } from "../api/complianceApi";

// ── 类型 ──────────────────────────────────────────────────────────────

export interface ComplianceFormData {
  hsCode: string;
  originCountry: string;
  destCountry: string;
  cargoValue: string;
  incoterm: string;
}

export interface RiskItem {
  type: string;
  level: string;
  description: string;
  rate: string;
  product?: string;
}

export interface TariffInfo {
  mfn: { rate: number; amount: number };
  additional: { rate: number; amount: number };
  total: number;
}

export interface VatInfo {
  rate: number;
  calculation_base: string;
  estimated_amount: number;
}

export interface DocRequirement {
  name: string;
  mandatory: boolean;
  description: string;
  authority?: string;
}

export interface ScanResult {
  country: string;
  hsCode: string;
  risks: RiskItem[];
  tariffs: TariffInfo;
  vat: VatInfo;
  totalDutyAndTax: number;
  requiredDocs: DocRequirement[];
  specialDocs: { name: string; mandatory: boolean; description: string }[];
  notes: string;
}

export const DEFAULT_COMPLIANCE_FORM: ComplianceFormData = {
  hsCode: "",
  originCountry: "CN",
  destCountry: "US",
  cargoValue: "",
  incoterm: "FOB",
};

const COUNTRIES = [
  { value: "US", label: "🇺🇸 美国" },
  { value: "DE", label: "🇪🇺 德国（欧盟）" },
  { value: "JP", label: "🇯🇵 日本" },
  { value: "TH", label: "🇹🇭 泰国" },
  { value: "GB", label: "🇬🇧 英国" },
];

export { COUNTRIES };

// ── Store ─────────────────────────────────────────────────────────────

interface ComplianceState {
  formData: ComplianceFormData;
  scanResult: ScanResult | null;
  loading: boolean;
  selectedDoc: string | null;
  docFormData: Record<string, string>;

  setFormData: (data: Partial<ComplianceFormData>) => void;
  startScan: () => Promise<void>;
  setScanResult: (result: ScanResult | null) => void;
  selectDoc: (docType: string | null) => void;
  updateDocForm: (field: string, value: string) => void;
  clearDocForm: () => void;
}

export const useComplianceStore = create<ComplianceState>((set) => ({
  formData: { ...DEFAULT_COMPLIANCE_FORM },
  scanResult: null,
  loading: false,
  selectedDoc: null,
  docFormData: {},

  setFormData: (data) =>
    set((s) => ({ formData: { ...s.formData, ...data } })),

  startScan: async () => {
    set({ loading: true, scanResult: null });
    try {
      const state = useComplianceStore.getState();
      const { formData } = state;
      const result = await scanComplianceApi({
        hsCode: formData.hsCode,
        originCountry: formData.originCountry || "CN",
        destCountry: formData.destCountry,
        cargoValue: Number(formData.cargoValue),
        incoterm: formData.incoterm || "FOB",
      });
      // 小延迟让 UI 过渡自然
      await new Promise((r) => setTimeout(r, 500));
      set({ loading: false, scanResult: result });
    } catch (err: unknown) {
      set({ loading: false, scanResult: null });
      const msg =
        err instanceof Error ? err.message : "合规扫描失败，请检查网络或重试";
      message.error(msg);
    }
  },

  setScanResult: (result) => set({ loading: false, scanResult: result }),

  selectDoc: (docType) => set({ selectedDoc: docType, docFormData: {} }),

  updateDocForm: (field, value) =>
    set((s) => ({ docFormData: { ...s.docFormData, [field]: value } })),

  clearDocForm: () => set({ docFormData: {} }),
}));
