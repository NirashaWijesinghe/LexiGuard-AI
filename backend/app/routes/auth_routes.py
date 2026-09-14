from fastapi import APIRouter, Depends, HTTPException, status, Header
from pydantic import BaseModel
from typing import Optional
from datetime import timedelta
import jwt

from app.services.auth_service import auth_service, SECRET_KEY, ALGORITHM
from app.config import settings

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

class UserCreate(BaseModel):
    email: str
    password: str

class UserLogin(BaseModel):
    email: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    user: dict

def get_current_user(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    token = authorization.split(" ")[1]
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        user = auth_service.get_user_by_email(email)
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
        return dict(user)
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Could not validate credentials")

@router.post("/register", response_model=Token)
async def register(user: UserCreate):
    try:
        new_user = auth_service.register_user(user.email, user.password)
        access_token_expires = timedelta(minutes=60*24*7)
        access_token = auth_service.create_access_token(
            data={"sub": new_user["email"]}, expires_delta=access_token_expires
        )
        return {"access_token": access_token, "token_type": "bearer", "user": new_user}
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/login", response_model=Token)
async def login(user: UserLogin):
    authenticated_user = auth_service.authenticate_user(user.email, user.password)
    if not authenticated_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user_dict = dict(authenticated_user)
    # Remove password_hash from response
    user_dict.pop("password_hash", None)
    
    access_token_expires = timedelta(minutes=60*24*7)
    access_token = auth_service.create_access_token(
        data={"sub": user.email, "role": user_dict["role"]}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer", "user": user_dict}

@router.get("/me")
async def read_users_me(user = Depends(get_current_user)):
    return user

@router.get("/admin/stats")
async def get_admin_stats(user = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    return auth_service.get_stats()

@router.get("/admin/users")
async def get_all_users(user = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    return auth_service.get_all_users()
