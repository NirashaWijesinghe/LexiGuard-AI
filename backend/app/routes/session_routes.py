from typing import List
from fastapi import APIRouter, HTTPException, Depends
from app.models.schemas import ChatSessionMeta, CreateSessionRequest, SessionDetailResponse, SavedChatMessage
from app.services.session_service import session_service
from app.routes.auth_routes import get_current_user

router = APIRouter(prefix="/api/sessions", tags=["Sessions"])

@router.get("", response_model=List[ChatSessionMeta])
async def list_sessions(current_user = Depends(get_current_user)):
    """List all saved chat sessions sorted by recent activity."""
    sessions = session_service.list_sessions(user_id=current_user["id"])
    return sessions

@router.post("", response_model=ChatSessionMeta)
async def create_session(request: CreateSessionRequest, current_user = Depends(get_current_user)):
    """Create a new chat session."""
    session = session_service.create_session(user_id=current_user["id"], title=request.title or "New Chat", doc_id=request.doc_id)
    return session

@router.get("/{session_id}", response_model=SessionDetailResponse)
async def get_session_detail(session_id: str, current_user = Depends(get_current_user)):
    """Get full details and all messages with citations for a specific session."""
    session = session_service.get_session(session_id)
    if not session or session.get("user_id") != current_user["id"]:
        raise HTTPException(status_code=404, detail="Session not found")
    
    messages = session_service.get_session_messages(session_id)
    return SessionDetailResponse(
        session=ChatSessionMeta(
            id=session["id"],
            title=session["title"],
            doc_id=session["doc_id"],
            created_at=session["created_at"],
            updated_at=session["updated_at"],
            message_count=len(messages)
        ),
        messages=[SavedChatMessage(**m) for m in messages]
    )

@router.delete("/{session_id}")
async def delete_session(session_id: str, current_user = Depends(get_current_user)):
    """Delete a chat session and its conversation history."""
    session = session_service.get_session(session_id)
    if not session or session.get("user_id") != current_user["id"]:
        raise HTTPException(status_code=404, detail="Session not found")
        
    deleted = session_service.delete_session(session_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"success": True, "message": "Session deleted successfully"}
