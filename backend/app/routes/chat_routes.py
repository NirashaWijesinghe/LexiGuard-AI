import uuid
from datetime import datetime
from fastapi import APIRouter, HTTPException
from app.models.schemas import ChatRequest, ChatResponse, SourceCitation
from app.services.vector_service import vector_service
from app.services.ai_service import ai_service
from app.services.session_service import session_service
from app.config import settings
from app.routes.auth_routes import get_current_user
from fastapi import Depends

router = APIRouter(prefix="/api/chat", tags=["Chat"])

@router.post("", response_model=ChatResponse)
async def chat_with_documents(request: ChatRequest, current_user = Depends(get_current_user)):
    """
    RAG Chat endpoint:
    1. Queries ChromaDB for top relevant context chunks.
    2. Constructs prompt with retrieved context.
    3. Calls LLM (Gemini) to generate grounded response.
    4. Automatically saves prompt and answer to session database.
    5. Returns answer along with source citations and session_id.
    """
    query = request.message.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    # 1. Ensure or create session
    session_id = request.session_id
    if not session_id:
        title = query[:45] + "..." if len(query) > 45 else query
        new_session = session_service.create_session(user_id=current_user["id"], title=title, doc_id=request.doc_id)
        session_id = new_session["id"]

    # Save user message to session
    user_ts = datetime.now().strftime("%I:%M %p")
    session_service.add_message(
        session_id=session_id,
        role="user",
        content=query,
        user_id=current_user["id"],
        timestamp=user_ts
    )

    # 2. Semantic search in Vector Database
    context_chunks = vector_service.query_relevant_chunks(
        query=query, 
        top_k=4, 
        doc_id=request.doc_id
    )

    # 3. Synthesize AI Response via Gemini
    ai_answer = ai_service.generate_rag_response(
        query=query,
        context_chunks=context_chunks,
        history=request.history
    )

    # 4. Format citations
    citations = [
        SourceCitation(
            page_number=c["page_number"],
            content=c["text"][:280] + "..." if len(c["text"]) > 280 else c["text"],
            doc_id=c["doc_id"],
            filename=c["filename"],
            score=c.get("score")
        )
        for c in context_chunks
    ]

    # Save assistant response to session
    ai_ts = datetime.now().strftime("%I:%M %p")
    citations_data = [c.model_dump() for c in citations]
    session_service.add_message(
        session_id=session_id,
        role="assistant",
        content=ai_answer,
        user_id=current_user["id"],
        sources=citations_data,
        timestamp=ai_ts
    )

    return ChatResponse(
        answer=ai_answer,
        sources=citations,
        session_id=session_id,
        doc_id=request.doc_id,
        model_used=settings.GEMINI_MODEL
    )

