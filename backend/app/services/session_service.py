import sqlite3
import json
import uuid
import os
from datetime import datetime
from typing import List, Dict, Any, Optional

if os.environ.get("VERCEL"):
    DB_PATH = "/tmp/chat_history.db"
else:
    DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "chat_history.db")

class SessionService:
    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path
        self._init_db()

    def _get_connection(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS chat_sessions (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    doc_id TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS chat_messages (
                    id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    sources_json TEXT,
                    timestamp TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
                )
            """)
            conn.commit()

    def create_session(self, user_id: str, title: str = "New Chat", doc_id: Optional[str] = None, session_id: Optional[str] = None) -> Dict[str, Any]:
        sid = session_id or str(uuid.uuid4())
        now = datetime.utcnow().isoformat()
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO chat_sessions (id, user_id, title, doc_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                (sid, user_id, title, doc_id, now, now)
            )
            conn.commit()
        return {
            "id": sid,
            "user_id": user_id,
            "title": title,
            "doc_id": doc_id,
            "created_at": now,
            "updated_at": now,
            "message_count": 0
        }

    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM chat_sessions WHERE id = ?", (session_id,))
            row = cursor.fetchone()
            if not row:
                return None
            return dict(row)

    def list_sessions(self, user_id: str) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT 
                    s.id, 
                    s.user_id,
                    s.title, 
                    s.doc_id, 
                    s.created_at, 
                    s.updated_at,
                    COUNT(m.id) as message_count
                FROM chat_sessions s
                LEFT JOIN chat_messages m ON s.id = m.session_id
                WHERE s.user_id = ?
                GROUP BY s.id
                ORDER BY s.updated_at DESC
            """, (user_id,))
            rows = cursor.fetchall()
            return [dict(r) for r in rows]

    def get_session_messages(self, session_id: str) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC",
                (session_id,)
            )
            rows = cursor.fetchall()
            messages = []
            for r in rows:
                item = dict(r)
                if item.get("sources_json"):
                    try:
                        item["sources"] = json.loads(item["sources_json"])
                    except Exception:
                        item["sources"] = []
                else:
                    item["sources"] = []
                messages.append(item)
            return messages

    def add_message(
        self, 
        session_id: str, 
        role: str, 
        content: str, 
        user_id: Optional[str] = None,
        sources: Optional[List[Dict[str, Any]]] = None,
        timestamp: Optional[str] = None,
        msg_id: Optional[str] = None
    ) -> Dict[str, Any]:
        mid = msg_id or str(uuid.uuid4())
        now = datetime.utcnow().isoformat()
        ts = timestamp or datetime.now().strftime("%I:%M %p")
        sources_str = json.dumps(sources) if sources else None

        with self._get_connection() as conn:
            cursor = conn.cursor()
            # Ensure session exists
            cursor.execute("SELECT id FROM chat_sessions WHERE id = ?", (session_id,))
            if not cursor.fetchone():
                if not user_id:
                    raise ValueError("user_id must be provided to create a new session")
                title = content[:40] + "..." if len(content) > 40 else content
                self.create_session(user_id=user_id, title=title, session_id=session_id)

            cursor.execute(
                "INSERT INTO chat_messages (id, session_id, role, content, sources_json, timestamp, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (mid, session_id, role, content, sources_str, ts, now)
            )
            # Update session's updated_at
            cursor.execute("UPDATE chat_sessions SET updated_at = ? WHERE id = ?", (now, session_id))
            conn.commit()

        return {
            "id": mid,
            "session_id": session_id,
            "role": role,
            "content": content,
            "sources": sources or [],
            "timestamp": ts,
            "created_at": now
        }

    def update_session_title(self, session_id: str, title: str) -> bool:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE chat_sessions SET title = ? WHERE id = ?", (title, session_id))
            conn.commit()
            return cursor.rowcount > 0

    def delete_session(self, session_id: str) -> bool:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM chat_messages WHERE session_id = ?", (session_id,))
            cursor.execute("DELETE FROM chat_sessions WHERE id = ?", (session_id,))
            conn.commit()
            return cursor.rowcount > 0

session_service = SessionService()
