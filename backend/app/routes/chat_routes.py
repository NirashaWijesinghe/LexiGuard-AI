import uuid
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends
from app.models.schemas import ChatRequest, ChatResponse, SourceCitation
from app.services.vector_service import vector_service
from app.services.ai_service import ai_service
from app.services.session_service import session_service
from app.config import settings
from app.routes.auth_routes import get_current_user

router = APIRouter(prefix="/api/chat", tags=["Chat"])

@router.post("", response_model=ChatResponse)
async def chat_with_documents(request: ChatRequest, current_user = Depends(get_current_user)):
    """
    RAG Chat endpoint:
    1. Queries ChromaDB & CloudStore for top relevant context chunks.
    2. Constructs prompt with retrieved context.
    3. Calls LLM (Gemini) to generate grounded response.
    4. Safely saves prompt and answer to session database.
    5. Returns answer along with source citations and session_id.
    """
    query = request.message.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    # 1. Ensure or create session safely
    session_id = request.session_id
    if not session_id:
        try:
            title = query[:45] + "..." if len(query) > 45 else query
            new_session = session_service.create_session(
                user_id=current_user["id"], 
                title=title, 
                doc_id=request.doc_id
            )
            session_id = new_session["id"]
        except Exception as se:
            print(f"[ChatRoutes] Session create warning: {se}")
            session_id = str(uuid.uuid4())

    # Save user message to session
    try:
        user_ts = datetime.now().strftime("%I:%M %p")
        session_service.add_message(
            session_id=session_id,
            role="user",
            content=query,
            user_id=current_user["id"],
            timestamp=user_ts
        )
    except Exception as me:
        print(f"[ChatRoutes] User message save warning: {me}")

    # 2. Semantic search in Vector Database & CloudStore
    try:
        context_chunks = vector_service.query_relevant_chunks(
            query=query, 
            top_k=4, 
            doc_id=request.doc_id
        )
    except Exception as ve:
        print(f"[ChatRoutes] Vector search warning: {ve}")
        context_chunks = []

    # 3. Synthesize AI Response via Gemini
    try:
        ai_answer = ai_service.generate_rag_response(
            query=query,
            context_chunks=context_chunks,
            history=request.history
        )
    except Exception as ge:
        print(f"[ChatRoutes] Gemini generation error: {ge}")
        ai_answer = f"I retrieved legal clauses from your contract, but encountered a temporary AI processing error: {str(ge)}"

    # 4. Format citations
    citations = []
    for c in context_chunks:
        try:
            citations.append(
                SourceCitation(
                    page_number=c.get("page_number", 1),
                    content=c["text"][:280] + "..." if len(c.get("text", "")) > 280 else c.get("text", ""),
                    doc_id=c.get("doc_id", ""),
                    filename=c.get("filename", "Document"),
                    score=c.get("score")
                )
            )
        except Exception:
            pass

    # Save assistant response to session
    try:
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
    except Exception as me2:
        print(f"[ChatRoutes] Assistant message save warning: {me2}")

    return ChatResponse(
        answer=ai_answer,
        sources=citations,
        session_id=session_id,
        doc_id=request.doc_id,
        model_used=settings.GEMINI_MODEL
    )
