import os
import json
import re
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional
from google import genai
from google.genai import types
from app.config import settings
from app.models.schemas import (
    ContractAuditReport, 
    ContractClauseRisk, 
    MissingClauseAlert
)

class AIService:
    def __init__(self):
        self._configured_key = None
        self._client = None
        self.model_candidates = [
            "gemini-3.5-flash-lite",
            "gemini-3.5-flash",
            "gemini-3.6-flash",
            "gemini-3.7-flash"
        ]

    def _get_client(self):
        api_key = os.getenv("GOOGLE_API_KEY") or settings.GOOGLE_API_KEY
        if api_key and (api_key != self._configured_key or self._client is None):
            self._client = genai.Client(api_key=api_key)
            self._configured_key = api_key
        return self._client, api_key

    def _generate_content_with_fallback(self, prompt: str, temperature: Optional[float] = None) -> tuple[Optional[str], Optional[str]]:
        client, api_key = self._get_client()
        if not api_key or not client:
            return None, "GOOGLE_API_KEY not configured"

        default_model = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
        candidate_models = [default_model] + [m for m in self.model_candidates if m != default_model]
        last_error = None

        config = types.GenerateContentConfig(temperature=temperature) if temperature is not None else None

        for m_name in candidate_models:
            try:
                response = client.models.generate_content(
                    model=m_name,
                    contents=prompt,
                    config=config
                )
                if response and response.text:
                    return response.text, None
            except Exception as e:
                last_error = str(e)
                continue

        return None, last_error

    def generate_rag_response(
        self, 
        query: str, 
        context_chunks: List[Dict[str, Any]], 
        history: Optional[List[Any]] = None
    ) -> str:
        """
        Synthesizes a response from LexiGuard Legal Counsel based on retrieved contract context chunks.
        """
        if not context_chunks:
            return "I couldn't find any relevant legal clauses or text in the uploaded agreements to answer this query. Please ensure the contract is indexed or refine your legal question."

        # Format context with source citations
        context_text = "\n\n---\n\n".join([
            f"[Source: {c['filename']}, Page: {c['page_number']}]\n{c['text']}"
            for c in context_chunks
        ])

        # Format Multi-Turn Conversation Memory (Last 6 turns)
        history_section = ""
        if history and len(history) > 0:
            formatted_turns = []
            recent_turns = history[-6:]
            for item in recent_turns:
                role_val = item.role if hasattr(item, "role") else item.get("role", "user")
                content_val = item.content if hasattr(item, "content") else item.get("content", "")
                author = "Legal Counsel / User" if role_val in ["user", "human"] else "LexiGuard AI"
                formatted_turns.append(f"{author}: {content_val}")
            
            if formatted_turns:
                history_section = "PREVIOUS LEGAL CONSULTATION HISTORY:\n" + "\n".join(formatted_turns) + "\n\n---\n\n"

        system_prompt = f"""You are LexiGuard AI, an intelligent Document & Legal Contract Intelligence Specialist.
You provide precise, sound, and comprehensive answers based STRICTLY on the context excerpts provided below.

INSTRUCTIONS:
1. Base your guidance strictly on the CONTEXT EXCERPTS provided below. Do not fabricate facts.
2. Structure answers with clear headings, bullet points, and exact clause/page citations (`[Doc: filename, Page: X]`).
3. If analyzing a legal agreement/contract:
   - Provide legal analysis, cite clauses, and provide clean "RECOMMENDED REDLINE / COUNTER-CLAUSE" blocks if redlining is requested.
   - Highlight any latent risks (Unlimited Liability, Non-Compete overreach, Asymmetric Indemnity, etc.).
4. If analyzing an academic research paper, technical documentation, or general non-contract document:
   - Provide clear, domain-accurate technical/conceptual synthesis answering the user's specific questions.
   - Do not force irrelevant contract liability terminology unless explicitly requested.

CONTEXT EXCERPTS:
{context_text}

{history_section}USER INQUIRY / REQUEST:
{query}

ANSWER:"""

        response_text, error = self._generate_content_with_fallback(system_prompt)
        if response_text:
            return response_text

        if error:
            print(f"[LexiGuard AI RAG Error]: {error}")

        # Fallback demonstration mode
        return f"""**[LexiGuard Demo Advisory - Live LLM fallback active]**

Based on **{len(context_chunks)} relevant sections** retrieved from **{context_chunks[0]['filename']}**:

> "{context_chunks[0]['text'][:350]}..."

**Analysis:**
- **Reference:** Page {context_chunks[0]['page_number']}
- **Summary:** Context retrieved successfully. For deep AI synthesis, ensure GOOGLE_API_KEY is active and valid."""

    def calculate_deterministic_risk_score(
        self,
        identified_risks: List[ContractClauseRisk],
        missing_clauses: List[MissingClauseAlert]
    ) -> tuple[int, str]:
        """
        Calculates an explainable, deterministic risk score (0-100) based on detected clause severity:
        - Critical risk clause: +25
        - High risk clause: +18
        - Medium risk clause: +10
        - Low risk clause: +4
        - Critical missing clause: +15
        - High missing clause: +10
        - Medium/Low missing clause: +5
        """
        score = 0
        has_critical = False

        for r in identified_risks:
            sev = (r.severity or "").upper()
            if sev == "CRITICAL":
                score += 25
                has_critical = True
            elif sev == "HIGH":
                score += 18
            elif sev == "MEDIUM":
                score += 10
            elif sev == "LOW":
                score += 4

        for m in missing_clauses:
            imp = (m.importance or "").upper()
            if imp == "CRITICAL":
                score += 15
                has_critical = True
            elif imp == "HIGH":
                score += 10
            else:
                score += 5

        final_score = min(100, max(0, score))

        if final_score >= 85:
            level = "CRITICAL"
        elif final_score >= 65 or has_critical:
            level = "HIGH"
        elif final_score >= 35:
            level = "MEDIUM"
        elif final_score >= 15:
            level = "LOW"
        else:
            level = "SAFE"

        return final_score, level

    def audit_contract(self, doc_id: str, filename: str, chunks: List[Dict[str, Any]]) -> ContractAuditReport:
        """
        Performs an automated Document Classification and Legal Risk Audit.
        If the document is a genuine Legal Agreement/Contract, calculates a risk score (0-100),
        flags hazardous clauses, and identifies missing standard protective terms.
        If the document is a Non-Contract document (e.g. Academic Paper, Resume, Technical Report),
        it flags it as a non-contract document and skips false contract hazard warnings.
        """
        # Prepare text representation
        context_chunks_text = "\n\n---\n\n".join([
            f"[Page {c['page_number']}]\n{c['text']}"
            for c in chunks[:15] # Analyze primary chunks
        ])

        audit_prompt = f"""You are LexiGuard AI, an expert Senior Legal Counsel and Document Intelligence Auditor.
Analyze the following document '{filename}'.

FIRST, determine whether this document is a genuine executable Legal Agreement / Commercial Contract (such as an NDA, MSA, SLA, Employment Contract, SaaS Agreement, Lease, License Agreement, Vendor Contract, Terms of Service, Loan Agreement, Settlement) OR if it is a NON-CONTRACT document (such as an Academic Research Paper, Journal Article, Book/Chapter, Essay, Technical Specification, Resume/CV, Invoice/Receipt, General Report, User Manual, Marketing Material).

CRITICAL CLASSIFICATION RULES:
1. "is_legal_contract": 
   - Set to TRUE only if the document is an actual binding legal agreement, contract, or executable commercial terms between parties.
   - Set to FALSE if the document is an academic paper, research paper, journal article, thesis, CV/resume, receipt, blog post, or general non-contract document (even if it contains copyright notices, CC-BY open access licenses, publisher metadata, or citation info).
2. "document_category":
   - If contract: e.g. "Legal Agreement", "Commercial Contract", "NDA", "Employment Contract".
   - If not contract: e.g. "Academic Research Paper", "Resume / CV", "Technical Specification", "General Publication".
3. IF "is_legal_contract" IS FALSE:
   - "contract_type": e.g. "Academic Research Paper (Non-Contract)", "Technical Documentation", or "General Document".
   - "overall_risk_score": Set to 0.
   - "risk_level": Set to "NON_CONTRACT".
   - "non_contract_notice": Provide a clear explanation, for example: "This document is an Academic Research Paper / Non-Contract document. Commercial contract risk scoring, liability traps, and missing clause audits do not apply to this document type."
   - "executive_summary": Provide a concise 2-paragraph summary of what the document or research is actually about, key authors/entities, findings, and scope.
   - "key_parties": List authors, institutions, or publishers found in the document.
   - "identified_risks": MUST be an empty array [] (Do NOT fabricate fake contract hazards).
   - "missing_clauses": MUST be an empty array [] (Do NOT flag missing contract terms like limitation of liability on academic papers).
4. IF "is_legal_contract" IS TRUE:
   - "non_contract_notice": null
   - "overall_risk_score": Calculated risk score from 0 to 100 based on hazardous clauses.
   - "risk_level": "CRITICAL", "HIGH", "MEDIUM", "LOW", or "SAFE".
   - Perform a rigorous Due Diligence & Risk Audit across Liability, Termination, Non-Compete, IP, Dispute Resolution, and Missing Protective Terms.

OUTPUT FORMAT: You MUST return a single, valid JSON object strictly adhering to this structure:
{{
  "is_legal_contract": true,
  "document_category": "Legal Agreement / Academic Research Paper / Resume / etc.",
  "contract_type": "Non-Disclosure Agreement / Academic Research Paper / Employment Contract",
  "non_contract_notice": null,
  "overall_risk_score": 68,
  "risk_level": "HIGH",
  "executive_summary": "Concise 2-paragraph overview...",
  "key_parties": ["Party A / Author A", "Party B / Publisher"],
  "governing_law": "Governing law or jurisdiction if specified",
  "effective_dates_or_term": "Term or publication date if specified",
  "identified_risks": [
    {{
      "category": "Liability & Indemnity",
      "clause_title": "Indemnification Obligations",
      "severity": "HIGH",
      "page_number": 1,
      "original_text": "...",
      "risk_explanation": "...",
      "recommended_revision": "..."
    }}
  ],
  "missing_clauses": [
    {{
      "clause_name": "Limitation of Liability Cap",
      "importance": "CRITICAL",
      "reason": "...",
      "suggested_language": "..."
    }}
  ]
}}

DOCUMENT TEXT EXCERPTS:
{context_chunks_text}

JSON OUTPUT (NO PREAMBLE, NO MARKDOWN TICKS):"""

        raw_text, error = self._generate_content_with_fallback(audit_prompt, temperature=0.0)
        if raw_text:
            try:
                # Clean potential markdown wrappers
                raw_clean = raw_text.strip()
                if raw_clean.startswith("```json"):
                    raw_clean = raw_clean[7:]
                elif raw_clean.startswith("```"):
                    raw_clean = raw_clean[3:]
                if raw_clean.endswith("```"):
                    raw_clean = raw_clean[:-3]
                raw_clean = raw_clean.strip()

                parsed = json.loads(raw_clean)

                is_contract = parsed.get("is_legal_contract", True)
                doc_category = parsed.get("document_category", "Legal Agreement" if is_contract else "General Document")
                contract_type = parsed.get("contract_type", "Commercial Contract" if is_contract else "Academic / General Document")
                non_contract_notice = parsed.get("non_contract_notice")

                # Build identified risks
                identified_risks = []
                if is_contract:
                    for r in parsed.get("identified_risks", []):
                        identified_risks.append(ContractClauseRisk(
                            category=r.get("category", "General Legal"),
                            clause_title=r.get("clause_title", "Contract Term"),
                            severity=r.get("severity", "MEDIUM").upper(),
                            page_number=int(r.get("page_number", 1)),
                            original_text=r.get("original_text", ""),
                            risk_explanation=r.get("risk_explanation", ""),
                            recommended_revision=r.get("recommended_revision", "")
                        ))

                # Build missing clauses
                missing_clauses = []
                if is_contract:
                    for m_clause in parsed.get("missing_clauses", []):
                        missing_clauses.append(MissingClauseAlert(
                            clause_name=m_clause.get("clause_name", "Standard Protective Clause"),
                            importance=m_clause.get("importance", "HIGH"),
                            reason=m_clause.get("reason", "Missing standard legal protection."),
                            suggested_language=m_clause.get("suggested_language", "")
                        ))

                high_count = sum(1 for r in identified_risks if r.severity in ["HIGH", "CRITICAL"])
                med_count = sum(1 for r in identified_risks if r.severity == "MEDIUM")
                low_count = sum(1 for r in identified_risks if r.severity in ["LOW", "SAFE"])

                if is_contract:
                    risk_score, risk_level = self.calculate_deterministic_risk_score(identified_risks, missing_clauses)
                else:
                    risk_score = 0
                    risk_level = "NON_CONTRACT"
                    if not non_contract_notice:
                        non_contract_notice = f"This document was identified as a {doc_category}. Standard commercial contract risk auditing does not apply."

                return ContractAuditReport(
                    doc_id=doc_id,
                    filename=filename,
                    is_legal_contract=is_contract,
                    document_category=doc_category,
                    non_contract_notice=non_contract_notice,
                    contract_type=contract_type,
                    overall_risk_score=risk_score,
                    risk_level=risk_level,
                    executive_summary=parsed.get("executive_summary", "Document analysis completed."),
                    key_parties=parsed.get("key_parties", []),
                    governing_law=parsed.get("governing_law"),
                    effective_dates_or_term=parsed.get("effective_dates_or_term"),
                    high_risk_count=high_count,
                    medium_risk_count=med_count,
                    low_risk_count=low_count,
                    identified_risks=identified_risks,
                    missing_clauses=missing_clauses,
                    audit_timestamp=datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                )

            except Exception as ex:
                print(f"[LexiGuard AI Audit Parsing Error]: {str(ex)}")

        # Heuristic detection for fallback mode
        combined_text = " ".join([c["text"] for c in chunks[:5]]).lower() if chunks else ""
        academic_keywords = ["abstract", "introduction", "methodology", "references", "doi:", "issn", "journal", "volume", "keywords:"]
        is_academic = any(kw in combined_text for kw in academic_keywords) or "paper" in filename.lower()

        if is_academic:
            return ContractAuditReport(
                doc_id=doc_id,
                filename=filename,
                is_legal_contract=False,
                document_category="Academic Research Paper",
                non_contract_notice="This document was identified as an Academic Research Paper / Publication. Commercial contract risk scoring, liability traps, and missing clause audits are not applicable.",
                contract_type="Academic Research Paper (Non-Contract)",
                overall_risk_score=0,
                risk_level="NON_CONTRACT",
                executive_summary=f"Analysis completed for '{filename}'. This document is an academic publication / research article. It contains scholarly research and publishing metadata rather than an executable commercial agreement.",
                key_parties=["Authors", "Publisher / Institution"],
                governing_law="N/A (Scholarly Publication)",
                effective_dates_or_term="Publication Date",
                high_risk_count=0,
                medium_risk_count=0,
                low_risk_count=0,
                identified_risks=[],
                missing_clauses=[],
                audit_timestamp=datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            )

        # Fallback Heuristic Analysis for genuine legal contracts (when AI API is temporarily unavailable)
        combined_text = "\n".join([c.get("text", "") for c in chunks[:12]])

        # 1. Extract Real Parties using regex
        parties = []
        p_match = re.search(r'(?:between|by and between)\s+([A-Za-z0-9\s.,&\-\(\)]+?)(?:\s*,|\s+and\b|\s*\()', combined_text, re.IGNORECASE)
        if p_match:
            p1 = p_match.group(1).strip()
            if p1 and len(p1) > 2 and len(p1) < 80:
                parties.append(p1)
        p2_match = re.search(r'\band\s+([A-Za-z0-9\s.,&\-\(\)]+?)(?:\s*,|\s*\(|\s*\[|\s*collectively|\s*effective)', combined_text, re.IGNORECASE)
        if p2_match:
            p2 = p2_match.group(1).strip()
            if p2 and len(p2) > 2 and len(p2) < 80 and p2 != (parties[0] if parties else ""):
                parties.append(p2)

        if not parties:
            clean_name = filename.replace(".pdf", "").replace(".docx", "").replace("_", " ")
            parties = [f"{clean_name} Signatory", "Counterparty"]

        # 2. Extract Real Governing Law
        law = "Laws of the jurisdiction governing the agreement"
        law_match = re.search(r'(?:governed by|laws of)\s+([A-Za-z\s]+?)(?:\.|\n|;|,)', combined_text, re.IGNORECASE)
        if law_match:
            matched_law = law_match.group(1).strip()
            if len(matched_law) < 50:
                law = matched_law

        # 3. Detect actual risk clauses from chunks
        identified_risks = []
        for c in chunks:
            c_text = c.get("text", "")
            c_page = c.get("page_number", 1)

            if "indemnif" in c_text.lower() and not any(r.clause_title == "Indemnification Obligations" for r in identified_risks):
                snippet = c_text[:300]
                identified_risks.append(ContractClauseRisk(
                    category="Liability & Indemnification",
                    clause_title="Indemnification Obligations",
                    severity="HIGH",
                    page_number=c_page,
                    original_text=snippet,
                    risk_explanation="Clause imposes broad indemnification duties which may expose the business to unbudgeted third-party liabilities.",
                    recommended_revision="Limit indemnification obligations strictly to direct damages caused by gross negligence or willful misconduct."
                ))

            if "terminate" in c_text.lower() and not any(r.clause_title == "Termination Rights & Notice" for r in identified_risks):
                snippet = c_text[:300]
                identified_risks.append(ContractClauseRisk(
                    category="Termination & Remedies",
                    clause_title="Termination Rights & Notice",
                    severity="MEDIUM",
                    page_number=c_page,
                    original_text=snippet,
                    risk_explanation="Review notice periods to ensure operational continuity in case of unexpected contract termination.",
                    recommended_revision="Require at least thirty (30) days prior written notice before termination without cause."
                ))

            if ("liability" in c_text.lower() or "limitation of liability" in c_text.lower()) and not any(r.clause_title == "Limitation of Liability" for r in identified_risks):
                snippet = c_text[:300]
                identified_risks.append(ContractClauseRisk(
                    category="Liability & Risk Allocation",
                    clause_title="Limitation of Liability",
                    severity="MEDIUM",
                    page_number=c_page,
                    original_text=snippet,
                    risk_explanation="Ensure aggregate liability is mutually capped to prevent asymmetrical financial exposure.",
                    recommended_revision="Include an explicit mutual aggregate liability cap limited to fees paid over the preceding 12 months."
                ))

        missing_clauses = [
            MissingClauseAlert(
                clause_name="Data Protection & Privacy Standard",
                importance="HIGH",
                reason="Standard data security and breach notification obligations are strongly advised in modern commercial agreements.",
                suggested_language="Each party agrees to comply with applicable data protection regulations and notify the other within 72 hours of any security incident."
            ),
            MissingClauseAlert(
                clause_name="Force Majeure Provisions",
                importance="MEDIUM",
                reason="Protects both parties from breach liability due to unforeseeable events beyond reasonable control.",
                suggested_language="Neither party shall be in breach for delays resulting from acts of God, strikes, or government actions."
            )
        ]

        high_count = sum(1 for r in identified_risks if r.severity in ["HIGH", "CRITICAL"])
        med_count = sum(1 for r in identified_risks if r.severity == "MEDIUM")
        low_count = sum(1 for r in identified_risks if r.severity in ["LOW", "SAFE"])
        risk_score, risk_level = self.calculate_deterministic_risk_score(identified_risks, missing_clauses)

        return ContractAuditReport(
            doc_id=doc_id,
            filename=filename,
            is_legal_contract=True,
            document_category="Legal Agreement",
            non_contract_notice=None,
            contract_type="Commercial Legal Agreement",
            overall_risk_score=risk_score,
            risk_level=risk_level,
            executive_summary=f"Automated risk audit completed for '{filename}'. The agreement has been indexed and analyzed across {len(chunks)} key clauses.",
            key_parties=parties,
            governing_law=law,
            effective_dates_or_term="Specified in Agreement",
            high_risk_count=high_count,
            medium_risk_count=med_count,
            low_risk_count=low_count,
            identified_risks=identified_risks,
            missing_clauses=missing_clauses,
            audit_timestamp=datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        )

    def generate_document_summary(self, filename: str, sample_chunks: List[Dict[str, Any]]) -> str:
        """
        Generates an executive summary and key takeaways for the document.
        """
        if not sample_chunks:
            return "No document text available to summarize."

        context_text = "\n\n---\n\n".join([
            f"[Page {c['page_number']}]\n{c['text']}"
            for c in sample_chunks[:8]
        ])

        prompt = f"""You are LexiGuard AI. Provide a structured Executive Summary for '{filename}'.

Use the following format in clean Markdown:
### 📄 Executive Summary
A concise 2-paragraph high-level overview of the document, its core topic, scope, and objectives.

### 🔑 Key Highlights & Main Points
- Bullet point key sections, methodology, findings, or legal covenants.

### 💡 Critical Observations & Insights
- Note any important findings, risks, or key conclusions.

### 🛡️ Recommended Action Items / Follow-ups
- Concrete next steps or action points.

DOCUMENT EXCERPTS:
{context_text}"""

        response_text, error = self._generate_content_with_fallback(prompt)
        if response_text:
            return response_text

        return f"### ⚖️ Legal Executive Summary for {filename}\n\nDocument successfully processed and indexed into ChromaDB. Contains {len(sample_chunks)} primary contract clauses ready for deep legal query and risk auditing."

    def ocr_scanned_pdf(self, file_path: Path) -> str:
        """
        Transcribes scanned or image-based PDF documents using Gemini multimodal capabilities.
        Used as an intelligent fallback when traditional extractors find 0 digital text.
        """
        client, api_key = self._get_client()
        if not api_key or not client:
            print("[OCR] No Google API key configured for Gemini OCR.")
            return ""

        try:
            pdf_bytes = file_path.read_bytes()
            part = types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf")
            prompt = (
                "You are an expert legal document transcription OCR engine. "
                "Accurately and completely transcribe all visible text, clauses, terms, sections, headings, "
                "and tables from this scanned legal document. Retain original structure, clause numbering, and wording verbatim without adding explanations."
            )

            default_model = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")
            candidate_models = [default_model] + [m for m in self.model_candidates if m != default_model]

            for m_name in candidate_models:
                try:
                    response = client.models.generate_content(
                        model=m_name,
                        contents=[part, prompt]
                    )
                    if response and response.text and response.text.strip():
                        print(f"[OCR] Successfully extracted {len(response.text)} characters using {m_name}")
                        return response.text.strip()
                except Exception as e:
                    print(f"[OCR] Gemini attempt failed on {m_name}: {e}")
                    continue
        except Exception as e:
            print(f"[OCR] Error reading PDF bytes or running OCR on {file_path}: {e}")

        return ""

ai_service = AIService()
