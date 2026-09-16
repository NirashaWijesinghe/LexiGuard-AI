import os
from pathlib import Path
from dotenv import load_dotenv

# Base directory paths
BASE_DIR = Path(__file__).resolve().parent.parent

if os.environ.get("VERCEL"):
    UPLOAD_DIR = Path("/tmp/uploads")
    CHROMA_PERSIST_DIR = Path("/tmp/chroma_db")
else:
    UPLOAD_DIR = BASE_DIR / "uploads"
    CHROMA_PERSIST_DIR = BASE_DIR / "chroma_db"

# Ensure runtime directories exist
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
CHROMA_PERSIST_DIR.mkdir(parents=True, exist_ok=True)

# Load environment variables from .env file
load_dotenv(BASE_DIR / ".env")

class Settings:
    PROJECT_NAME: str = "LexiGuard AI"
    VERSION: str = "2.0.0"
    DESCRIPTION: str = "Enterprise Legal Contract Intelligence, Automated Risk Scoring & Redline Compliance Auditor API"
    
    # AI API Keys
    GOOGLE_API_KEY: str = os.getenv("GOOGLE_API_KEY", "")
    
    # Model Configurations
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")
    EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL", "models/embedding-001")
    
    # Storage Paths
    UPLOAD_PATH: Path = UPLOAD_DIR
    CHROMA_PATH: Path = CHROMA_PERSIST_DIR
    
    # CORS
    ALLOWED_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://*.vercel.app"
    ]

settings = Settings()
