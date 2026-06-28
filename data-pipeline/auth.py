"""
auth.py — Stateless JWT 认证模块（适配 Vercel Serverless）
- JWT 内嵌完整用户信息，无需查数据库
- 密码用 JWT claims 中的 hash 验证
- 无状态：不依赖文件系统或数据库
"""
from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from pydantic import BaseModel

# ── JWT 配置 ────────────────────────────────────────────────────────────
SECRET_KEY = os.getenv(
    "LOGIBRIDGE_JWT_SECRET",
    "logibridge-dev-secret-key-do-not-use-in-production",
)
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24

# ── Bearer token ───────────────────────────────────────────────────────
bearer_scheme = HTTPBearer(auto_error=False)

# ── Pydantic 模型 ──────────────────────────────────────────────────────

class UserCreate(BaseModel):
    email: str; password: str; name: str

class UserLogin(BaseModel):
    email: str; password: str

class UserPublic(BaseModel):
    id: str; email: str; name: str; createdAt: str

class TokenResponse(BaseModel):
    access_token: str; token_type: str = "bearer"; user: UserPublic

class UserSettingsPublic(BaseModel):
    language: str = "zh-CN"; currency: str = "USD"
    default_incoterm: str = "FOB"; notify_by_email: bool = True
    notify_by_sms: bool = False; notify_on_delay: bool = True
    notify_on_risk: bool = True

class UserSettingsUpdate(BaseModel):
    language: Optional[str] = None; currency: Optional[str] = None
    default_incoterm: Optional[str] = None; notify_by_email: Optional[bool] = None
    notify_by_sms: Optional[bool] = None; notify_on_delay: Optional[bool] = None
    notify_on_risk: Optional[bool] = None

DEFAULT_USER_SETTINGS = {
    "language": "zh-CN", "currency": "USD", "default_incoterm": "FOB",
    "notify_by_email": True, "notify_by_sms": False,
    "notify_on_delay": True, "notify_on_risk": True,
}

# ── 工具 ────────────────────────────────────────────────────────────────

def _now_iso(): return datetime.now(timezone.utc).isoformat()
def _new_id(): return uuid.uuid4().hex[:12]

# ── 密码（无状态：从 JWT hash 验证）────────────────────────────────────

def hash_password(password: str) -> str:
    import bcrypt
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(plain: str, hashed: str) -> bool:
    import bcrypt
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False

# ── JWT（无状态：JWT 内嵌所有用户数据）─────────────────────────────────

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def decode_access_token(token: str) -> dict:
    try: return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Token 无效或已过期",
                            headers={"WWW-Authenticate": "Bearer"})

# ── 依赖项（从 JWT 中直接提取用户，不查库）───────────────────────────

async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> Optional[dict]:
    if credentials is None: return None
    payload = decode_access_token(credentials.credentials)
    uid = payload.get("sub")
    if not uid: return None
    return {
        "id": uid,
        "email": payload.get("email", ""),
        "name": payload.get("name", ""),
        "createdAt": payload.get("createdAt", ""),
        "hashed_password": payload.get("hash", ""),
    }

async def get_current_user_required(
    current_user: Optional[dict] = Depends(get_current_user),
) -> dict:
    if current_user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="请先登录", headers={"WWW-Authenticate": "Bearer"})
    return current_user

# ── 用户注册（无状态：仅生成 JWT）─────────────────────────────────────

def create_user(email: str, password: str, name: str) -> dict:
    now = _now_iso()
    uid = _new_id()
    return {
        "id": uid,
        "email": email.lower().strip(),
        "hashed_password": hash_password(password),
        "name": name.strip(),
        "createdAt": now,
    }

def authenticate_user_by_hash(email: str, password: str, stored_hash: str) -> Optional[dict]:
    """用 JWT 中存储的 hash 验证密码（无状态登录）"""
    if not verify_password(password, stored_hash):
        return None
    return True  # 返回 True 表示验证通过

def user_to_public(user: dict) -> UserPublic:
    return UserPublic(id=user["id"], email=user["email"], name=user["name"], createdAt=user["createdAt"])

# ── 用户设置（内存中，可后续扩展存储）─────────────────────────────────

_user_settings: dict[str, dict] = {}

def get_user_settings(user_id: str) -> dict:
    settings = _user_settings.get(user_id)
    return {**DEFAULT_USER_SETTINGS, **settings} if settings else dict(DEFAULT_USER_SETTINGS)

def update_user_settings(user_id: str, updates: dict) -> dict:
    current = get_user_settings(user_id)
    for k, v in updates.items():
        if v is not None and k in DEFAULT_USER_SETTINGS: current[k] = v
    _user_settings[user_id] = current
    return current

# ── API Key（内存中，可后续扩展存储）──────────────────────────────────

_user_api_keys: dict[str, list[dict]] = {}

def create_api_key_for_user(user_id: str, name: str = "") -> dict:
    key_id = _new_id(); key_value = f"lgb_{uuid.uuid4().hex}"; now = _now_iso()
    ak = {"id": key_id, "userId": user_id, "name": name.strip() or f"API Key {key_id[:8]}",
          "key": key_value, "createdAt": now, "lastUsedAt": None}
    _user_api_keys.setdefault(user_id, []).append(ak)
    return ak

def list_api_keys_for_user(user_id: str) -> list[dict]:
    return [dict(k, key=k["key"][:12]+"...") for k in _user_api_keys.get(user_id, [])]

def delete_api_key_for_user(user_id: str, key_id: str) -> bool:
    keys = _user_api_keys.get(user_id, [])
    for i, k in enumerate(keys):
        if k["id"] == key_id: keys.pop(i); return True
    return False
