import axios from "axios";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

export interface DocumentMeta {
  doc_id: string;
  filename: string;
  file_size_kb: number;
  total_pages: number;
  total_chunks: number;
  uploaded_at: string;
  risk_score?: number | null;
  risk_level?: string | null;
  is_legal_contract?: boolean | null;
  document_category?: string | null;
}

export interface SampleContract {
  id: string;
  filename: string;
  title: string;
  description: string;
  risk_level: string;
  contract_type: string;
  tags: string[];
}

export interface SourceCitation {
  page_number: number;
  content: string;
  doc_id: string;
  filename: string;
  score?: number;
}

export interface ChatMessage {
  id: string;
  session_id?: string;
  role: "user" | "assistant";
  content: string;
  sources?: SourceCitation[];
  timestamp: string;
}

export interface ChatSession {
  id: string;
  title: string;
  doc_id?: string | null;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface SessionDetail {
  session: ChatSession;
  messages: ChatMessage[];
}

export interface ContractClauseRisk {
  category: string;
  clause_title: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "SAFE" | string;
  page_number: number;
  original_text: string;
  risk_explanation: string;
  recommended_revision: string;
}

export interface MissingClauseAlert {
  clause_name: string;
  importance: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | string;
  reason: string;
  suggested_language: string;
}

export interface ContractAuditReport {
  doc_id: string;
  filename: string;
  is_legal_contract?: boolean;
  document_category?: string;
  non_contract_notice?: string | null;
  contract_type: string;
  overall_risk_score: number;
  risk_level: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "SAFE" | "NON_CONTRACT" | string;
  executive_summary: string;
  key_parties: string[];
  governing_law?: string;
  effective_dates_or_term?: string;
  high_risk_count: number;
  medium_risk_count: number;
  low_risk_count: number;
  identified_risks: ContractClauseRisk[];
  missing_clauses: MissingClauseAlert[];
  audit_timestamp: string;
}

export async function uploadDocument(file: File): Promise<{ success: boolean; message: string; document: DocumentMeta }> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await api.post("/api/documents/upload", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return response.data;
}

export async function uploadBatchDocuments(files: File[]): Promise<{
  success: boolean;
  message: string;
  total_uploaded: number;
  successful_documents: DocumentMeta[];
  failed_files: { filename: string; reason: string }[];
}> {
  const formData = new FormData();
  files.forEach((file) => {
    formData.append("files", file);
  });

  const response = await api.post("/api/documents/upload-batch", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return response.data;
}

export async function fetchDocuments(): Promise<DocumentMeta[]> {
  try {
    const response = await api.get("/api/documents");
    return response.data.documents || [];
  } catch (error) {
    return [];
  }
}

export async function deleteDocument(docId: string): Promise<void> {
  await api.delete(`/api/documents/${docId}`);
}

export async function fetchSampleContracts(): Promise<SampleContract[]> {
  try {
    const response = await api.get("/api/documents/samples");
    return response.data.samples || [];
  } catch (error) {
    console.error("Failed to fetch sample contracts", error);
    return [];
  }
}

export async function loadSampleContract(sampleIdOrFilename: string): Promise<{ success: boolean; message: string; document: DocumentMeta }> {
  const response = await api.post("/api/documents/load-sample", {
    sample_id: sampleIdOrFilename,
  });
  return response.data;
}

export async function sendChatMessage(
  message: string, 
  docId?: string, 
  history: { role: string; content: string }[] = [],
  sessionId?: string | null
): Promise<{ answer: string; sources: SourceCitation[]; doc_id?: string; session_id: string }> {
  const response = await api.post("/api/chat", {
    message,
    doc_id: docId || null,
    history,
    session_id: sessionId || null,
  });
  return response.data;
}

export async function summarizeDocument(docId: string): Promise<{ doc_id: string; filename: string; summary: string }> {
  const response = await api.post(`/api/documents/${docId}/summarize`);
  return response.data;
}

export async function auditContract(docId: string): Promise<ContractAuditReport> {
  const response = await api.post(`/api/documents/${docId}/audit`);
  return response.data;
}

export async function getContractAudit(docId: string): Promise<ContractAuditReport> {
  const response = await api.get(`/api/documents/${docId}/audit`);
  return response.data;
}

export async function exportAuditReport(docId: string): Promise<{ doc_id: string; filename: string; markdown_report: string }> {
  const response = await api.get(`/api/documents/${docId}/export-audit`);
  return response.data;
}

export async function fetchSessions(): Promise<ChatSession[]> {
  try {
    const response = await api.get("/api/sessions");
    return response.data || [];
  } catch (error) {
    console.error("Failed to fetch sessions", error);
    return [];
  }
}

export async function fetchSessionDetail(sessionId: string): Promise<SessionDetail | null> {
  try {
    const response = await api.get(`/api/sessions/${sessionId}`);
    return response.data;
  } catch (error) {
    console.error(`Failed to fetch session detail for ${sessionId}`, error);
    return null;
  }
}

export async function createSession(title: string = "New Legal Consultation", docId?: string | null): Promise<ChatSession> {
  const response = await api.post("/api/sessions", {
    title,
    doc_id: docId || null,
  });
  return response.data;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await api.delete(`/api/sessions/${sessionId}`);
}

export async function checkBackendHealth(): Promise<{ status: string; has_gemini_key: boolean }> {
  try {
    const response = await api.get("/api/health");
    return response.data;
  } catch (error) {
    return { status: "offline", has_gemini_key: false };
  }
}

