/**
 * usePlanStore.ts — 方案推演页面的全局状态
 */

import { create } from "zustand";

// ── 类型 ──────────────────────────────────────────────────────────────

export interface FormData {
  origin: string;          // 起运港代码，如 CNSGH
  dest: string;            // 目的港代码
  hsCode: string;          // HS 编码前 6 位
  cargoValue: string;      // 货物总价值 USD
  currency: string;         // 币种
  arrivalDeadline: string;  // 最晚到港日期
  incoterm: string;        // 贸易术语
  containerType: string;   // 20GP / 40GP / 40HQ
  isDangerous: boolean;    // 是否危险品
}

export interface PlanSegment {
  from: string;
  to: string;
  transportMode: "sea" | "rail" | "air" | "road";
  estimatedDays: number;
  freight: number;
}

export interface PlanResult {
  id: string;
  label: string;
  description: string;
  totalFreight: number;
  totalDays: number;
  carbonEmission: number;    // kg CO₂
  riskLevel: "low" | "medium" | "high";
  segments: PlanSegment[];
  color: [number, number, number];
  icon: string;
}

export const DEFAULT_FORM_DATA: FormData = {
  origin: "",
  dest: "",
  hsCode: "",
  cargoValue: "",
  currency: "USD",
  arrivalDeadline: "",
  incoterm: "",
  containerType: "40HQ",
  isDangerous: false,
};

// ── Store ─────────────────────────────────────────────────────────────

interface PlanState {
  formData: FormData;
  results: PlanResult[];
  loading: boolean;
  selectedIndex: number;

  setFormData: (data: Partial<FormData>) => void;
  startGeneration: () => void;
  setResults: (results: PlanResult[]) => void;
  selectPlan: (index: number) => void;
}

export const usePlanStore = create<PlanState>((set) => ({
  formData: { ...DEFAULT_FORM_DATA },
  results: [],
  loading: false,
  selectedIndex: -1,

  setFormData: (data) =>
    set((s) => ({ formData: { ...s.formData, ...data } })),

  startGeneration: () => set({ loading: true, results: [], selectedIndex: -1 }),

  setResults: (results) => set({ loading: false, results }),

  selectPlan: (index) => set({ selectedIndex: index }),
}));
