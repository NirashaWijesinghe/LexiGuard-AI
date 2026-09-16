import sqlite3
import uuid
import os
import json
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
import bcrypt
import jwt
from fastapi import HTTPException, status
from app.config import settings

if os.environ.get("VERCEL"):
    DB_PATH = "/tmp/chat_history.db"
else:
    DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "chat_history.db")

SECRET_KEY = settings.GOOGLE_API_KEY if settings.GOOGLE_API_KEY else "super-secret-key-for-dev"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7 # 7 days

class AuthService:
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
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    name TEXT DEFAULT '',
                    role TEXT NOT NULL DEFAULT 'user',
                    created_at TEXT NOT NULL
                )
            """)
            try:
                cursor.execute("ALTER TABLE users ADD COLUMN name TEXT DEFAULT ''")
            except Exception:
                pass
            conn.commit()

        # Seed default users if empty
        try:
            if not self.get_user_by_email("admin@gmail.com"):
                self.register_user("admin@gmail.com", "admin123", name="System Administrator", role="admin")
            if not self.get_user_by_email("nirasha@gmail.com"):
                self.register_user("nirasha@gmail.com", "nirasha123", name="Nirasha Wijesinghe", role="user")
        except Exception:
            pass

    def get_password_hash(self, password: str) -> str:
        salt = bcrypt.gensalt()
        hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
        return hashed.decode('utf-8')

    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        try:
            return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
        except Exception:
            return False

    def create_access_token(self, data: dict, expires_delta: Optional[timedelta] = None):
        to_encode = data.copy()
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(minutes=15)
        to_encode.update({"exp": expire})
        encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
        return encoded_jwt

    def get_user_by_email(self, email: str) -> Optional[sqlite3.Row]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM users WHERE email = ?", (email,))
            return cursor.fetchone()

    def get_user_by_id(self, user_id: str) -> Optional[sqlite3.Row]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
            return cursor.fetchone()

    def register_user(self, email: str, password: str, name: str = "", role: str = "user") -> Dict[str, Any]:
        existing_user = self.get_user_by_email(email)
        if existing_user:
            raise HTTPException(status_code=400, detail="Email already registered")
        
        import hashlib
        user_id = hashlib.md5(email.lower().strip().encode("utf-8")).hexdigest()
        hashed_password = self.get_password_hash(password)
        now = datetime.utcnow().isoformat()
        clean_name = name.strip() if name else ""
        
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO users (id, email, password_hash, name, role, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (user_id, email, hashed_password, clean_name, role, now)
            )
            conn.commit()
            
        return {
            "id": user_id,
            "email": email,
            "name": clean_name,
            "role": role,
            "created_at": now
        }

    def authenticate_user(self, email: str, password: str):
        user = self.get_user_by_email(email)
        if not user:
            return False
        if not self.verify_password(password, user["password_hash"]):
            return False
        return user

    def get_stats(self) -> Dict[str, Any]:
        """Get system statistics for admin dashboard."""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            cursor.execute("SELECT COUNT(*) as count FROM users")
            user_count = cursor.fetchone()["count"]
            
        doc_count = 0
        meta_file = settings.UPLOAD_PATH / "documents_meta.json"
        try:
            if os.path.exists(meta_file):
                with open(meta_file, "r", encoding="utf-8") as f:
                    meta_data = json.load(f)
                    doc_count = len(meta_data)
        except Exception:
            pass
            
        return {
            "total_users": user_count,
            "total_documents": doc_count
        }

    def get_all_users(self) -> list:
        """Get all registered users for admin dashboard."""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # Don't fetch password hashes
            cursor.execute("SELECT id, email, role, created_at FROM users ORDER BY created_at DESC")
            users = cursor.fetchall()
            return [dict(u) for u in users]

auth_service = AuthService()
