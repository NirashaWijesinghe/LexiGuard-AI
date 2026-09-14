from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime

class DocumentMetadata(BaseModel):
    doc_id: str
    filename: str
    file_size_kb: float
    total_pages: int
    total_chunks: int
    uploaded_at: str
    user_id: Optional[str] = None
    risk_score: Optional[int] = None
    risk_level: Optional[str] = None
    is_legal_contract: Optional[bool] = None
    document_category: Optional[str] = None

class UploadResponse(BaseModel):
    success: bool
    message: str
    document: Optional[DocumentMetadata] = None

class BatchUploadResponse(BaseModel):
    success: bool
    message: str
    total_uploaded: int
    successful_documents: List[DocumentMetadata]
    failed_files: List[dict] = []

class DocumentListResponse(BaseModel):
    documents: List[DocumentMetadata]
    total_count: int = 0
    samples: Optional[List[dict]] = []

class ChatMessage(BaseModel):
    role: str = Field(..., description="'user' or 'assistant'")
    content: str

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    doc_id: Optional[str] = None
    history: Optional[List[ChatMessage]] = []

class SourceCitation(BaseModel):
    page_number: int
    content: str
    doc_id: str
    filename: str
    score: Optional[float] = None

class ChatResponse(BaseModel):
    answer: str
    sources: List[SourceCitation]
    session_id: Optional[str] = None
    doc_id: Optional[str] = None
    model_used: str = "gemini-3.6-flash"

class ChatSessionMeta(BaseModel):
    id: str
    title: str
    doc_id: Optional[str] = None
    created_at: str
    updated_at: str
    message_count: int = 0

class CreateSessionRequest(BaseModel):
    title: Optional[str] = "New Chat"
    doc_id: Optional[str] = None

class SavedChatMessage(BaseModel):
    id: str
    session_id: str
    role: str
    content: str
    sources: Optional[List[SourceCitation]] = []
    timestamp: str
    created_at: str

class SessionDetailResponse(BaseModel):
    session: ChatSessionMeta
    messages: List[SavedChatMessage]

class ContractClauseRisk(BaseModel):
    category: str
    clause_title: str
    severity: str  # "CRITICAL", "HIGH", "MEDIUM", "LOW", "SAFE"
    page_number: int = 1
    original_text: str = ""
    risk_explanation: str = ""
    recommended_revision: str = ""

class MissingClauseAlert(BaseModel):
    clause_name: str
    importance: str  # "CRITICAL", "HIGH", "MEDIUM", "LOW"
    reason: str = ""
    suggested_language: str = ""

class ContractAuditReport(BaseModel):
    doc_id: str
    filename: str
    is_legal_contract: bool = True
    document_category: str = "Commercial Contract"
    non_contract_notice: Optional[str] = None
    contract_type: str
    overall_risk_score: int = 0
    risk_level: str = "SAFE"
    executive_summary: str = ""
    key_parties: List[str] = []
    governing_law: Optional[str] = None
    effective_dates_or_term: Optional[str] = None
    high_risk_count: int = 0
    medium_risk_count: int = 0
    low_risk_count: int = 0
    identified_risks: List[ContractClauseRisk] = []
    missing_clauses: List[MissingClauseAlert] = []
    audit_timestamp: str = ""


