import shutil
import json
import hashlib
from pathlib import Path
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, UploadFile, File, HTTPException, status
from app.config import settings
from app.services.pdf_service import pdf_service
from app.services.vector_service import vector_service
from app.services.ai_service import ai_service
from app.services.cloud_store import cloud_store
from app.models.schemas import (
    UploadResponse, 
    DocumentMetadata, 
    DocumentListResponse, 
    BatchUploadResponse,
    ContractAuditReport
)
from app.routes.auth_routes import get_current_user
from fastapi import Depends

router = APIRouter(prefix="/api/documents", tags=["Documents"])

# Metadata storage file
META_FILE = settings.UPLOAD_PATH / "documents_meta.json"
AUDIT_FILE = settings.UPLOAD_PATH / "contracts_audit.json"
CACHE_FILE = settings.UPLOAD_PATH / "audit_hash_cache.json"
_candidate_sample_dirs = [
    Path(__file__).resolve().parent.parent.parent / "sample_contracts",
    Path(__file__).resolve().parent.parent / "sample_contracts",
    Path("sample_contracts"),
]
SAMPLE_CONTRACTS_DIR = next((p for p in _candidate_sample_dirs if p.exists()), _candidate_sample_dirs[0])

SAMPLE_CATALOG = [
    {
        "id": "saas",
        "filename": "Enterprise_SaaS_Vendor_Agreement.pdf",
        "title": "Enterprise SaaS & Vendor Agreement",
        "description": "High Risk — Unlimited indemnification trap, immediate termination without cause, and broad IP assignment.",
        "risk_level": "HIGH",
        "contract_type": "Vendor SLA / Master Services Agreement",
        "tags": ["SaaS", "Indemnity Trap", "High Risk"]
    },
    {
        "id": "nda",
        "filename": "Mutual_Non_Disclosure_Agreement_NDA.pdf",
        "title": "Mutual Non-Disclosure Agreement (NDA)",
        "description": "Moderate Risk — 10-year perpetual confidentiality and strict 24-month non-solicitation of personnel.",
        "risk_level": "MEDIUM",
        "contract_type": "Mutual NDA",
        "tags": ["NDA", "Confidentiality", "Moderate Risk"]
    },
    {
        "id": "employment",
        "filename": "Employment_Agreement_Software_Engineer.pdf",
        "title": "Senior Software Engineer Employment Agreement",
        "description": "Critical Risk — Extreme non-compete covenants, broad IP assignment, and restrictive termination penalties.",
        "risk_level": "CRITICAL",
        "contract_type": "Employment Agreement",
        "tags": ["Employment", "Non-Compete", "Critical Risk"]
    }
]

def _load_meta() -> dict:
    if cloud_store.is_configured():
        cloud_data = cloud_store.get("documents_meta")
        if isinstance(cloud_data, dict):
            return cloud_data
    if META_FILE.exists():
        try:
            with open(META_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def _save_meta(data: dict):
    if cloud_store.is_configured():
        cloud_store.set("documents_meta", data)
    try:
        with open(META_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception:
        pass

def _load_audits() -> dict:
    if cloud_store.is_configured():
        cloud_data = cloud_store.get("contracts_audit")
        if isinstance(cloud_data, dict):
            return cloud_data
    if AUDIT_FILE.exists():
        try:
            with open(AUDIT_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def _save_audits(data: dict):
    if cloud_store.is_configured():
        cloud_store.set("contracts_audit", data)
    try:
        with open(AUDIT_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception:
        pass

def _load_hash_cache() -> dict:
    if cloud_store.is_configured():
        cloud_data = cloud_store.get("audit_hash_cache")
        if isinstance(cloud_data, dict):
            return cloud_data
    if CACHE_FILE.exists():
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def _save_hash_cache(data: dict):
    if cloud_store.is_configured():
        cloud_store.set("audit_hash_cache", data)
    try:
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception:
        pass

def _compute_document_hashes(file_path: Optional[Path], chunks: list) -> list[str]:
    """
    Computes content-based SHA-256 fingerprints from both raw file bytes and extracted chunks.
    Identical agreement files or text produce identical matching hashes.
    """
    hashes = []
    if file_path and file_path.exists():
        try:
            hashes.append(hashlib.sha256(file_path.read_bytes()).hexdigest())
        except Exception:
            pass
    if chunks:
        combined_text = "\n".join(str(c.get("text", "")) for c in chunks)
        hashes.append(hashlib.sha256(combined_text.strip().encode("utf-8")).hexdigest())
    return [h for h in hashes if h]

def _get_or_create_audit(doc_id: str, filename: str, chunks: list, file_path: Optional[Path] = None, force_refresh: bool = False) -> ContractAuditReport:
    """
    Returns cached audit report if an identical contract content hash was already audited,
    guaranteeing 100% score consistency across duplicate uploads. Otherwise runs AI audit.
    """
    hashes = _compute_document_hashes(file_path, chunks)
    hash_cache = _load_hash_cache()

    if not force_refresh:
        for h in hashes:
            if h in hash_cache:
                cached_data = dict(hash_cache[h])
                # Never serve cached mock fallback audits
                if cached_data.get("key_parties") != ["Party 1", "Party 2"]:
                    cached_data["doc_id"] = doc_id
                    cached_data["filename"] = filename
                    cached_data["audit_timestamp"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    report = ContractAuditReport(**cached_data)
                    
                    audits_dict = _load_audits()
                    audits_dict[doc_id] = report.model_dump()
                    _save_audits(audits_dict)
                    return report

    report = ai_service.audit_contract(doc_id, filename, chunks)

    # Only cache genuine AI audit reports (not mock fallback) under all matching hashes
    if report.key_parties != ["Party 1", "Party 2"]:
        for h in hashes:
            hash_cache[h] = report.model_dump()
        _save_hash_cache(hash_cache)

    audits_dict = _load_audits()
    audits_dict[doc_id] = report.model_dump()

    # Synchronize all duplicate document instances of the same file to guarantee 100% score consistency
    meta_dict = _load_meta()
    for other_id, other_meta in meta_dict.items():
        if other_meta.get("filename") == filename:
            other_rep = report.model_dump()
            other_rep["doc_id"] = other_id
            audits_dict[other_id] = other_rep
            other_meta["risk_score"] = report.overall_risk_score
            other_meta["risk_level"] = report.risk_level
            other_meta["is_legal_contract"] = report.is_legal_contract
            other_meta["document_category"] = report.document_category

    _save_meta(meta_dict)
    _save_audits(audits_dict)
    return report

@router.post("/upload", response_model=UploadResponse)
async def upload_document(file: UploadFile = File(...), current_user = Depends(get_current_user)):
    """
    Upload a Legal Contract (PDF or Word .docx), extract pages, chunk content, and index into ChromaDB.
    """
    allowed_extensions = {".pdf", ".docx"}
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF (.pdf) and Microsoft Word (.docx) documents are supported."
        )

    # Save document locally
    file_path = settings.UPLOAD_PATH / file.filename
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {str(e)}")

    # Extract & Chunk text (Word .docx, Digital PDF, or Gemini Multimodal OCR)
    try:
        chunks, total_pages, doc_id = pdf_service.process_document(file_path, file.filename)
        
        if not chunks:
            raise HTTPException(
                status_code=400,
                detail="Could not extract text from this document. Please verify the file contains readable content."
            )

        # Index chunks into Vector Database and CloudStore
        vector_service.add_chunks(chunks)
        if cloud_store.is_configured():
            cloud_store.set(f"doc_chunks:{doc_id}", chunks)

        # Run instant initial document classification & risk audit
        risk_score = None
        risk_level = None
        is_legal_contract = True
        document_category = "Legal Agreement"

        try:
            audit_report = _get_or_create_audit(doc_id, file.filename, chunks, file_path)
            risk_score = audit_report.overall_risk_score
            risk_level = audit_report.risk_level
            is_legal_contract = audit_report.is_legal_contract
            document_category = audit_report.document_category
        except Exception as audit_err:
            print(f"[DocumentUpload] Audit warning for {file.filename}: {audit_err}")

        # Store metadata
        file_size_kb = round(file_path.stat().st_size / 1024, 2)
        doc_meta = {
            "doc_id": doc_id,
            "filename": file.filename,
            "file_size_kb": file_size_kb,
            "total_pages": total_pages,
            "total_chunks": len(chunks),
            "uploaded_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "user_id": current_user["id"],
            "user_email": current_user.get("email"),
            "risk_score": risk_score,
            "risk_level": risk_level,
            "is_legal_contract": is_legal_contract,
            "document_category": document_category,
        }

        all_meta = _load_meta()
        all_meta[doc_id] = doc_meta
        _save_meta(all_meta)

        return UploadResponse(
            success=True,
            message=f"Document '{file.filename}' processed, audited & indexed ({total_pages} page(s), {len(chunks)} clauses).",
            document=DocumentMetadata(**doc_meta)
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing document: {str(e)}")

@router.post("/upload-batch", response_model=BatchUploadResponse)
async def upload_multiple_documents(files: list[UploadFile] = File(...), current_user = Depends(get_current_user)):
    """
    Upload multiple PDF or Word (.docx) documents in one request, extract, chunk, and index into ChromaDB.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files provided.")

    successful_docs: list[DocumentMetadata] = []
    failed_files: list[dict] = []
    all_meta = _load_meta()
    audits_dict = _load_audits()

    allowed_extensions = {".pdf", ".docx"}

    for file in files:
        file_ext = Path(file.filename).suffix.lower()
        if file_ext not in allowed_extensions:
            failed_files.append({"filename": file.filename, "reason": "Only PDF and Word (.docx) files are supported."})
            continue

        file_path = settings.UPLOAD_PATH / file.filename
        try:
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)

            chunks, total_pages, doc_id = pdf_service.process_document(file_path, file.filename)
            if not chunks:
                failed_files.append({"filename": file.filename, "reason": "No readable text extracted."})
                continue

            vector_service.add_chunks(chunks)
            if cloud_store.is_configured():
                cloud_store.set(f"doc_chunks:{doc_id}", chunks)

            # Instant audit
            risk_score = None
            risk_level = None
            is_legal_contract = True
            document_category = "Legal Agreement"

            try:
                audit_report = _get_or_create_audit(doc_id, file.filename, chunks, file_path)
                risk_score = audit_report.overall_risk_score
                risk_level = audit_report.risk_level
                is_legal_contract = audit_report.is_legal_contract
                document_category = audit_report.document_category
            except Exception as audit_err:
                print(f"[BatchUpload] Audit warning for {file.filename}: {audit_err}")

            file_size_kb = round(file_path.stat().st_size / 1024, 2)
            doc_meta = {
                "doc_id": doc_id,
                "filename": file.filename,
                "file_size_kb": file_size_kb,
                "total_pages": total_pages,
                "total_chunks": len(chunks),
                "uploaded_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "user_id": current_user["id"],
                "user_email": current_user.get("email"),
                "risk_score": risk_score,
                "risk_level": risk_level,
                "is_legal_contract": is_legal_contract,
                "document_category": document_category,
            }
            all_meta[doc_id] = doc_meta
            successful_docs.append(DocumentMetadata(**doc_meta))
        except Exception as err:
            failed_files.append({"filename": file.filename, "reason": str(err)})

    _save_audits(audits_dict)
    _save_meta(all_meta)

    error_msg = f"Failed to index: {failed_files[0]['reason']}" if failed_files and not successful_docs else f"Successfully indexed {len(successful_docs)} of {len(files)} document(s)."
    return BatchUploadResponse(
        success=len(successful_docs) > 0,
        message=error_msg,
        total_uploaded=len(successful_docs),
        successful_documents=successful_docs,
        failed_files=failed_files
    )

@router.get("/samples")
async def get_sample_contracts():
    """
    Returns pre-configured sample legal contracts ready for 1-click evaluation.
    """
    return {"samples": SAMPLE_CATALOG}

@router.post("/load-sample", response_model=UploadResponse)
async def load_sample_contract(payload: dict, current_user = Depends(get_current_user)):
    """
    Loads and processes a sample contract PDF directly from the sample catalog.
    """
    sample_id_or_file = payload.get("filename") or payload.get("id") or payload.get("sample_id")
    if not sample_id_or_file:
        raise HTTPException(status_code=400, detail="Missing sample identifier or filename.")

    # Find catalog item
    item = None
    for s in SAMPLE_CATALOG:
        if s["id"] == sample_id_or_file or s["filename"] == sample_id_or_file:
            item = s
            break
    
    filename = item["filename"] if item else sample_id_or_file
    if not filename.lower().endswith(".pdf"):
        filename = f"{filename}.pdf"

    # Source path
    source_pdf = SAMPLE_CONTRACTS_DIR / filename
    if not source_pdf.exists():
        alt_path = Path("sample_contracts") / filename
        if alt_path.exists():
            source_pdf = alt_path
        else:
            raise HTTPException(status_code=404, detail=f"Sample contract file '{filename}' not found.")

    # Destination in UPLOAD_PATH
    dest_path = settings.UPLOAD_PATH / filename
    try:
        shutil.copyfile(source_pdf, dest_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to copy sample file: {str(e)}")

    # Extract & Chunk text
    try:
        chunks, total_pages, doc_id = pdf_service.process_document(dest_path, filename)
        if not chunks:
            raise HTTPException(status_code=400, detail="Could not extract text from this sample contract.")

        # Index chunks
        vector_service.add_chunks(chunks)

        # Audit
        risk_score = None
        risk_level = None
        is_legal_contract = True
        document_category = "Legal Agreement"

        try:
            audit_report = _get_or_create_audit(doc_id, filename, chunks, dest_path)
            risk_score = audit_report.overall_risk_score
            risk_level = audit_report.risk_level
            is_legal_contract = audit_report.is_legal_contract
            document_category = audit_report.document_category
        except Exception as audit_err:
            print(f"[SampleLoad] Audit warning for {filename}: {audit_err}")

        # Store chunks in CloudStore
        if cloud_store.is_configured():
            cloud_store.set(f"doc_chunks:{doc_id}", chunks)

        file_size_kb = round(dest_path.stat().st_size / 1024, 2)
        doc_meta = {
            "doc_id": doc_id,
            "filename": filename,
            "file_size_kb": file_size_kb,
            "total_pages": total_pages,
            "total_chunks": len(chunks),
            "uploaded_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "user_id": current_user["id"],
            "user_email": current_user.get("email"),
            "risk_score": risk_score,
            "risk_level": risk_level,
            "is_legal_contract": is_legal_contract,
            "document_category": document_category,
        }

        all_meta = _load_meta()
        all_meta[doc_id] = doc_meta
        _save_meta(all_meta)

        return UploadResponse(
            success=True,
            message=f"Sample '{item['title'] if item else filename}' processed, audited & indexed.",
            document=DocumentMetadata(**doc_meta)
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing sample contract: {str(e)}")

@router.get("", response_model=DocumentListResponse)
async def list_documents(current_user = Depends(get_current_user)):
    """
    List all processed documents for the current user.
    Uses robust multi-field matching (user_id and user_email) ensuring documents never vanish.
    """
    all_meta = _load_meta()
    audits_dict = _load_audits()
    hash_cache = _load_hash_cache()
    
    current_user_id = current_user.get("id")
    current_user_email = (current_user.get("email") or "").lower().strip()
    user_docs = []
    for doc_id, doc in all_meta.items():
        doc_user_id = doc.get("user_id")
        doc_user_email = (doc.get("user_email") or "").lower().strip()

        # STRICT PER-USER ISOLATION:
        # A user ONLY sees documents that they uploaded themselves (matching user_id or email).
        is_owner = (
            (doc_user_id and doc_user_id == current_user_id)
            or (current_user_email and doc_user_email == current_user_email)
        )
        if is_owner:
            doc_data = dict(doc)
            file_path = settings.UPLOAD_PATH / doc.get("filename", "")
            content_hashes = _compute_document_hashes(file_path, [])
            cached = None
            for h in content_hashes:
                if h in hash_cache:
                    cached = hash_cache[h]
                    break

            if cached:
                doc_data["risk_score"] = cached.get("overall_risk_score")
                doc_data["risk_level"] = cached.get("risk_level")
                doc_data["is_legal_contract"] = cached.get("is_legal_contract", True)
                doc_data["document_category"] = cached.get("document_category", "Legal Agreement")
            elif doc_id in audits_dict:
                audit = audits_dict[doc_id]
                doc_data["risk_score"] = audit.get("overall_risk_score")
                doc_data["risk_level"] = audit.get("risk_level")
                doc_data["is_legal_contract"] = audit.get("is_legal_contract", True)
                doc_data["document_category"] = audit.get("document_category", "Legal Agreement")
            user_docs.append(DocumentMetadata(**doc_data))
            
    # Always include sample catalog for demo purposes
    samples = SAMPLE_CATALOG.copy()
    
    return DocumentListResponse(
        documents=user_docs,
        total_count=len(user_docs),
        samples=samples
    )

@router.post("/{doc_id}/audit", response_model=ContractAuditReport)
async def perform_contract_audit(doc_id: str, current_user = Depends(get_current_user)):
    """
    Performs a deep document intelligence / legal risk audit on the document.
    """
    meta_dict = _load_meta()
    if doc_id not in meta_dict:
        raise HTTPException(status_code=404, detail="Document not found")

    doc_info = meta_dict[doc_id]
    is_admin = current_user.get("role") == "admin"
    user_email = (current_user.get("email") or "").lower().strip()
    doc_email = (doc_info.get("user_email") or "").lower().strip()

    is_owner = (
        is_admin 
        or (doc_info.get("user_id") == current_user["id"])
        or (user_email and doc_email == user_email)
        or (not doc_info.get("user_id"))
    )
    if not is_owner:
        raise HTTPException(status_code=403, detail="Not authorized to access this document")

    chunks = vector_service.get_document_chunks(doc_id, limit=20)
    if not chunks and cloud_store.is_configured():
        cloud_chunks = cloud_store.get(f"doc_chunks:{doc_id}")
        if cloud_chunks and isinstance(cloud_chunks, list):
            chunks = cloud_chunks[:20]

    if not chunks:
        # Fallback: check if the document file exists in UPLOAD_PATH or SAMPLE_CONTRACTS_DIR
        candidate_paths = [
            settings.UPLOAD_PATH / doc_info.get("filename", ""),
            SAMPLE_CONTRACTS_DIR / doc_info.get("filename", ""),
            Path("sample_contracts") / doc_info.get("filename", "")
        ]
        for p in candidate_paths:
            if p.exists():
                try:
                    ext_chunks, _, _ = pdf_service.process_document(p, doc_info.get("filename", ""))
                    if ext_chunks:
                        chunks = ext_chunks[:20]
                        vector_service.add_chunks(ext_chunks)
                        if cloud_store.is_configured():
                            cloud_store.set(f"doc_chunks:{doc_id}", ext_chunks)
                        break
                except Exception as ex:
                    print(f"[perform_contract_audit] Fallback extraction error: {ex}")

    if not chunks:
        raise HTTPException(status_code=400, detail="No indexed clauses available for this contract.")

    # Run fresh AI audit (force_refresh=True to bypass hash cache)
    file_path = settings.UPLOAD_PATH / doc_info.get("filename", "")
    audit_report = _get_or_create_audit(doc_id, doc_info["filename"], chunks, file_path, force_refresh=True)

    # Update metadata with risk score & classification
    meta_dict[doc_id]["risk_score"] = audit_report.overall_risk_score
    meta_dict[doc_id]["risk_level"] = audit_report.risk_level
    meta_dict[doc_id]["is_legal_contract"] = audit_report.is_legal_contract
    meta_dict[doc_id]["document_category"] = audit_report.document_category
    _save_meta(meta_dict)

    return audit_report

@router.get("/{doc_id}/audit", response_model=ContractAuditReport)
async def get_document_audit(doc_id: str, current_user = Depends(get_current_user)):
    """
    Get the full audit report for a specific document, or generate a new one if not yet audited.
    """
    meta_dict = _load_meta()
    if doc_id in meta_dict:
        doc_info = meta_dict[doc_id]
        is_admin = current_user.get("role") == "admin"
        user_email = (current_user.get("email") or "").lower().strip()
        doc_email = (doc_info.get("user_email") or "").lower().strip()

        is_owner = (
            is_admin 
            or (doc_info.get("user_id") == current_user["id"])
            or (user_email and doc_email == user_email)
            or (not doc_info.get("user_id"))
        )
        if not is_owner:
            raise HTTPException(status_code=403, detail="Not authorized to access this document")

    audits_dict = _load_audits()
    if doc_id in audits_dict:
        return ContractAuditReport(**audits_dict[doc_id])

    # Check if this document content was already audited under another doc_id / cached hash
    if doc_id in meta_dict:
        doc_info = meta_dict[doc_id]
        file_path = settings.UPLOAD_PATH / doc_info.get("filename", "")
        if file_path.exists():
            content_hashes = _compute_document_hashes(file_path, [])
            hash_cache = _load_hash_cache()
            cached_data = None
            for h in content_hashes:
                if h in hash_cache:
                    cached_data = dict(hash_cache[h])
                    break
            if cached_data:
                cached_data["doc_id"] = doc_id
                cached_data["filename"] = doc_info.get("filename", "Document.pdf")
                report = ContractAuditReport(**cached_data)
                audits_dict[doc_id] = report.model_dump()
                _save_audits(audits_dict)
                return report

    # If not yet audited, run audit with authorized user context
    return await perform_contract_audit(doc_id, current_user=current_user)

@router.get("/{doc_id}/export-audit")
async def export_audit_markdown(doc_id: str, current_user = Depends(get_current_user)):
    """
    Generates an executive-ready Markdown Due Diligence or Document Intelligence report for export.
    """
    meta_dict = _load_meta()
    if doc_id not in meta_dict:
        raise HTTPException(status_code=404, detail="Document not found")

    doc_info = meta_dict[doc_id]
    is_admin = current_user.get("role") == "admin"
    user_email = (current_user.get("email") or "").lower().strip()
    doc_email = (doc_info.get("user_email") or "").lower().strip()

    is_owner = (
        is_admin 
        or (doc_info.get("user_id") == current_user["id"])
        or (user_email and doc_email == user_email)
        or (not doc_info.get("user_id"))
    )
    if not is_owner:
        raise HTTPException(status_code=403, detail="Not authorized to access this document")

    audits_dict = _load_audits()
    if doc_id not in audits_dict:
        # Run audit first
        audit_report = await perform_contract_audit(doc_id, current_user=current_user)
        audit_data = audit_report.model_dump()
    else:
        audit_data = audits_dict[doc_id]

    filename = audit_data.get("filename", "Document")
    timestamp = audit_data.get("audit_timestamp", "")
    summary = audit_data.get("executive_summary", "")
    parties = ", ".join(audit_data.get("key_parties", [])) or "Unspecified"
    doc_category = audit_data.get("document_category", "Legal Agreement")
    is_contract = audit_data.get("is_legal_contract", True)

    if not is_contract or audit_data.get("risk_level") == "NON_CONTRACT":
        full_report = f"""# 📄 LexiGuard AI Document Intelligence & Summary Report
**Document Title:** `{filename}`  
**Analyzed Date:** {timestamp}  
**Classification:** {doc_category} (Non-Contract Document)  
**Key Authors / Entities:** {parties}  
**Status:** Validated Non-Contract Document  

---

## 📌 Executive Summary
{summary}

---

## ℹ️ Notice Regarding Contract Audits
This document was verified as a **{doc_category}** rather than an executable commercial legal contract (e.g. NDA, MSA, SLA). Standard commercial contract risk audits, liability caps, and missing clause warnings are not applicable.

---
*Report generated automatically by LexiGuard AI Document Intelligence System.*
"""
        return {
            "doc_id": doc_id,
            "filename": filename,
            "markdown_report": full_report
        }

    # Format Contract Markdown Report
    score = audit_data.get("overall_risk_score", 0)
    level = audit_data.get("risk_level", "UNKNOWN")
    law = audit_data.get("governing_law", "Unspecified")
    term = audit_data.get("effective_dates_or_term", "Unspecified")

    risks_md = ""
    for idx, r in enumerate(audit_data.get("identified_risks", []), 1):
        risks_md += f"""
### {idx}. [{r.get('severity')}] {r.get('clause_title')} (Page {r.get('page_number')})
- **Category:** {r.get('category')}
- **Original Clause:** *"{r.get('original_text')}"*
- **Legal Risk Hazard:** {r.get('risk_explanation')}
- **AI Recommended Counter-Clause:**
```
{r.get('recommended_revision')}
```
"""

    missing_md = ""
    for idx, m in enumerate(audit_data.get("missing_clauses", []), 1):
        missing_md += f"""
### {idx}. [{m.get('importance')}] {m.get('clause_name')}
- **Reason Omission is Risky:** {m.get('reason')}
- **Recommended Clause to Insert:**
```
{m.get('suggested_language')}
```
"""

    full_report = f"""# ⚖️ LexiGuard AI Due Diligence & Contract Risk Audit Report
**Target Agreement:** `{filename}`  
**Audit Date:** {timestamp}  
**Contract Type:** {audit_data.get('contract_type')}  
**Overall Risk Assessment:** **{score}/100 ({level} RISK)**  
**Identified Parties:** {parties}  
**Governing Jurisdiction:** {law}  
**Effective Term:** {term}  

---

## 📌 Executive Summary
{summary}

---

## 🚨 Identified Hazardous Clauses & Redline Recommendations
{risks_md if risks_md else "No critical hazardous clauses identified."}

---

## ⚠️ Missing Standard Protective Terms (Negative Pattern Audit)
{missing_md if missing_md else "All standard protective terms are present."}

---
*Report generated automatically by LexiGuard AI Enterprise Legal Intelligence System.*
"""
    return {
        "doc_id": doc_id,
        "filename": filename,
        "markdown_report": full_report
    }

@router.post("/{doc_id}/summarize")
async def summarize_document(doc_id: str, current_user = Depends(get_current_user)):
    """
    Generates an executive legal summary and key takeaways for a specific document.
    """
    meta_dict = _load_meta()
    if doc_id not in meta_dict:
        raise HTTPException(status_code=404, detail="Document not found")

    doc_info = meta_dict[doc_id]
    is_admin = current_user.get("role") == "admin"
    user_email = (current_user.get("email") or "").lower().strip()
    doc_email = (doc_info.get("user_email") or "").lower().strip()

    is_owner = (
        is_admin 
        or (doc_info.get("user_id") == current_user["id"])
        or (user_email and doc_email == user_email)
        or (not doc_info.get("user_id"))
    )
    if not is_owner:
        raise HTTPException(status_code=403, detail="Not authorized to access this document")

    chunks = vector_service.get_document_chunks(doc_id, limit=8)
    if not chunks:
        candidate_paths = [
            settings.UPLOAD_PATH / doc_info.get("filename", ""),
            SAMPLE_CONTRACTS_DIR / doc_info.get("filename", ""),
            Path("sample_contracts") / doc_info.get("filename", "")
        ]
        for p in candidate_paths:
            if p.exists():
                try:
                    ext_chunks, _, _ = pdf_service.process_document(p, doc_info.get("filename", ""))
                    if ext_chunks:
                        chunks = ext_chunks[:8]
                        if cloud_store.is_configured():
                            cloud_store.set(f"doc_chunks:{doc_id}", ext_chunks)
                        break
                except Exception:
                    pass

    if not chunks:
        raise HTTPException(status_code=400, detail="No indexed chunks available for this document.")

    summary = ai_service.generate_document_summary(doc_info["filename"], chunks)
    return {
        "doc_id": doc_id,
        "filename": doc_info["filename"],
        "summary": summary
    }

@router.delete("/{doc_id}")
async def delete_document(doc_id: str, current_user = Depends(get_current_user)):
    """
    Deletes a document from the vector store and disk.
    """
    meta_dict = _load_meta()
    if doc_id not in meta_dict:
        raise HTTPException(status_code=404, detail="Document not found")

    doc_info = meta_dict[doc_id]
    is_admin = current_user.get("role") == "admin"
    user_email = (current_user.get("email") or "").lower().strip()
    doc_email = (doc_info.get("user_email") or "").lower().strip()

    is_owner = (
        is_admin 
        or (doc_info.get("user_id") == current_user["id"])
        or (user_email and doc_email == user_email)
        or (not doc_info.get("user_id"))
    )
    if not is_owner:
        raise HTTPException(status_code=403, detail="Not authorized to delete this document")

    # Delete from ChromaDB
    vector_service.delete_document(doc_id)

    # Delete chunks from CloudStore
    if cloud_store.is_configured():
        try:
            cloud_store.delete(f"doc_chunks:{doc_id}")
        except Exception:
            pass

    # Delete from audits if present
    audits_dict = _load_audits()
    if doc_id in audits_dict:
        audits_dict.pop(doc_id, None)
        _save_audits(audits_dict)

    # Delete file from disk if exists
    doc_info = meta_dict.pop(doc_id)
    file_path = settings.UPLOAD_PATH / doc_info["filename"]
    if file_path.exists():
        try:
            file_path.unlink()
        except Exception:
            pass

    _save_meta(meta_dict)
    return {"success": True, "message": f"Contract '{doc_info['filename']}' deleted successfully."}

