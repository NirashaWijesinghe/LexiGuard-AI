import os
import sys
from pathlib import Path
from fastapi import Request

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.main import app

@app.middleware("http")
async def vercel_path_fix_middleware(request: Request, call_next):
    # If deployed on Vercel, restore original requested path from x-matched-path header
    matched = request.headers.get("x-matched-path")
    if matched and matched != "/main.py":
        # Strip trailing query params if any
        raw_path = matched.split("?")[0]
        request.scope["path"] = raw_path

    response = await call_next(request)
    return response

@app.get("/ping")
def ping():
    return {"message": "pong from LexiGuard API"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
