from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.routes.document_routes import router as document_router
from app.routes.chat_routes import router as chat_router
from app.routes.session_routes import router as session_router
from app.routes.auth_routes import router as auth_router

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description=settings.DESCRIPTION,
    docs_url="/docs",
    redoc_url="/redoc"
)

from fastapi import Request

# Enable CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins in development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/ping")
def ping():
    return {"status": "ok", "message": "pong from LexiGuard backend"}

# Register routes
app.include_router(auth_router)
app.include_router(document_router)
app.include_router(chat_router)
app.include_router(session_router)


@app.get("/api/health", tags=["Health"])
async def health_check():
    return {
        "status": "healthy",
        "app": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "gemini_model": settings.GEMINI_MODEL,
        "has_gemini_key": bool(settings.GOOGLE_API_KEY)
    }

@app.get("/", tags=["Root"])
async def root():
    return {
        "message": "Welcome to LexiGuard AI Backend API",
        "docs": "/docs",
        "health": "/api/health"
    }
