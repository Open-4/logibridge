/**
 * complianceApi.ts — 合规相关 API 调用
 */

import client from "./client";
import type { ScanResult } from "../store/useComplianceStore";
import { saveAs } from "file-saver";

export interface ComplianceScanRequest {
  hsCode: string;
  originCountry: string;
  destCountry: string;
  cargoValue: number;
  incoterm: string;
}

export interface DocTemplate {
  docType: string;
  title: string;
  fields: Array<{
    name: string;
    label: string;
    type: "text" | "textarea" | "number" | "date" | "select";
    required: boolean;
    options?: string[];
  }>;
}

export interface DocGenerateRequest {
  docType: string;
  fields: Record<string, string>;
}

/**
 * 合规扫描
 */
export async function scanCompliance(
  params: ComplianceScanRequest,
): Promise<ScanResult> {
  const { data } = await client.post<ScanResult>("/api/compliance/scan", params);
  return data;
}

/**
 * 获取单证模板
 */
export async function getDocTemplate(docType: string): Promise<DocTemplate> {
  const { data } = await client.get<DocTemplate>(`/api/document/template/${docType}`);
  return data;
}

/**
 * 生成单证 — 接收 PDF blob，用 file-saver 触发下载
 */
export async function generateDocument(
  params: DocGenerateRequest,
): Promise<void> {
  const { data } = await client.post("/api/document/generate", params, {
    responseType: "blob",
  });
  const filename = `${params.docType}_${new Date().toISOString().slice(0, 10)}.pdf`;
  saveAs(data, filename);
}
