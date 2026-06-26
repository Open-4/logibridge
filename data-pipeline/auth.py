"""
auth.py — 用户认证模块
- 密码哈希 (bcrypt)
- JWT 签发 & 验证
- FastAPI 依赖项：get_current_user
"""

from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from pydantic import BaseModel

# ── JWT 配置 ────────────────────────────────────────────────────────────────
SECRET_KEY = os.getenv(
    "LOGIBRIDGE_JWT_SECRET",
    "logibridge-dev-secret-key-do-not-use-in-production",
)
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 默认 24 小时（开发阶段方便测试）

# ── 密码上下文 ──────────────────────────────────────────────────────────────
# 使用 bcrypt（不使用 passlib 的 CryptContext 以避免 bcrypt 5.x 兼容问题）
import hashlib
import base64

def hash_password(password: str) -> str:
    """使用 bcrypt 对密码进行哈希"""
    import bcrypt
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证密码是否匹配"""
    import bcrypt
    try:
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception:
        return False

# ── Bearer token 提取器 ────────────────────────────────────────────────────
bearer_scheme = HTTPBearer(auto_error=False)  # MVP 阶段先不强制认证

# ── Pydantic 模型 ───────────────────────────────────────────────────────────


class UserCreate(BaseModel):
    email: str
    password: str
    name: str


class UserLogin(BaseModel):
    email: str
    password: str


class UserPublic(BaseModel):
    id: str
    email: str
    name: str
    createdAt: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic


# ── 内存用户存储（MVP 阶段） ──────────────────────────────────────────────
USERS: dict[str, dict] = {}       # id -> user dict
USERS_BY_EMAIL: dict[str, dict] = {}  # email -> user dict


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id() -> str:
    return uuid.uuid4().hex[:12]


# ── 密码哈希 ────────────────────────────────────────────────────────────────


def hash_password(password: str) -> str:
    """使用 bcrypt 对密码进行哈希"""
    import bcrypt
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证密码是否匹配"""
    import bcrypt
    try:
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception:
        return False


# ── JWT 操作 ────────────────────────────────────────────────────────────────


def create_access_token(
    data: dict,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """创建 JWT access token"""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    """解码并验证 JWT token，返回 payload"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效或过期的 token",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ── FastAPI 依赖项 ──────────────────────────────────────────────────────────


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> Optional[dict]:
    """
    依赖项：从 Authorization Bearer 解析 token 获取当前用户。
    MVP 阶段返回 Optional，不强制要求登录。
    后续可通过修改 auto_error=True 或在路由层叠加密闭来强制认证。
    """
    if credentials is None:
        return None

    payload = decode_access_token(credentials.credentials)
    user_id: str | None = payload.get("sub")
    if user_id is None:
        return None

    user = USERS.get(user_id)
    if user is None:
        return None

    return user


async def get_current_user_required(
    current_user: Optional[dict] = Depends(get_current_user),
) -> dict:
    """
    依赖项：强制要求登录的版本。
    """
    if current_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="需要登录",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return current_user


# ── 用户 CRUD ───────────────────────────────────────────────────────────────


def create_user(email: str, password: str, name: str) -> dict:
    """创建新用户，存入内存存储"""
    user_id = _new_id()
    now = _now_iso()

    user = {
        "id": user_id,
        "email": email.lower().strip(),
        "hashed_password": hash_password(password),
        "name": name.strip(),
        "createdAt": now,
    }
    USERS[user_id] = user
    USERS_BY_EMAIL[user["email"]] = user
    return user


def get_user_by_email(email: str) -> dict | None:
    """通过邮箱查找用户"""
    return USERS_BY_EMAIL.get(email.lower().strip())


def authenticate_user(email: str, password: str) -> dict | None:
    """验证邮箱密码，成功返回用户对象，失败返回 None"""
    user = get_user_by_email(email)
    if not user:
        return None
    if not verify_password(password, user["hashed_password"]):
        return None
    return user


def user_to_public(user: dict) -> UserPublic:
    """将用户内部 dict 转换为公开信息（不暴露 hashed_password）"""
    return UserPublic(
        id=user["id"],
        email=user["email"],
        name=user["name"],
        createdAt=user["createdAt"],
    )


# ═══════════════════════════════════════════════════════════════════════
#  用户设置 — UserSettings
# ═══════════════════════════════════════════════════════════════════════

class UserSettingsPublic(BaseModel):
    language: str = "zh-CN"
    currency: str = "USD"
    default_incoterm: str = "FOB"
    notify_by_email: bool = True
    notify_by_sms: bool = False
    notify_on_delay: bool = True
    notify_on_risk: bool = True


class UserSettingsUpdate(BaseModel):
    language: Optional[str] = None
    currency: Optional[str] = None
    default_incoterm: Optional[str] = None
    notify_by_email: Optional[bool] = None
    notify_by_sms: Optional[bool] = None
    notify_on_delay: Optional[bool] = None
    notify_on_risk: Optional[bool] = None


# ── 默认设置 ──────────────────────────────────────────────────────────
DEFAULT_USER_SETTINGS = {
    "language": "zh-CN",
    "currency": "USD",
    "default_incoterm": "FOB",
    "notify_by_email": True,
    "notify_by_sms": False,
    "notify_on_delay": True,
    "notify_on_risk": True,
}

# user_id -> settings dict
USER_SETTINGS: dict[str, dict] = {}


def get_user_settings(user_id: str) -> dict:
    """获取用户设置，如不存在则返回默认值"""
    settings = USER_SETTINGS.get(user_id)
    if settings is None:
        return dict(DEFAULT_USER_SETTINGS)
    return settings


def update_user_settings(user_id: str, updates: dict) -> dict:
    """更新用户设置，缺失字段保留原值"""
    settings = USER_SETTINGS.get(user_id)
    if settings is None:
        settings = dict(DEFAULT_USER_SETTINGS)
        USER_SETTINGS[user_id] = settings

    for key, value in updates.items():
        if value is not None and key in DEFAULT_USER_SETTINGS:
            settings[key] = value
    return settings


# ═══════════════════════════════════════════════════════════════════════
#  API Key 管理
# ═══════════════════════════════════════════════════════════════════════

# user_id -> list of api_key dicts
USER_API_KEYS: dict[str, list[dict]] = {}


def create_api_key_for_user(user_id: str, name: str = "") -> dict:
    """为用户生成一个新的 API key"""
    key_id = _new_id()
    key_value = f"lgb_{uuid.uuid4().hex}"
    now = _now_iso()

    api_key = {
        "id": key_id,
        "userId": user_id,
        "name": name.strip() or f"API Key {key_id[:8]}",
        "key": key_value,
        "createdAt": now,
        "lastUsedAt": None,
    }

    if user_id not in USER_API_KEYS:
        USER_API_KEYS[user_id] = []
    USER_API_KEYS[user_id].append(api_key)

    return api_key


def list_api_keys_for_user(user_id: str) -> list[dict]:
    """返回用户的所有 API keys（隐藏完整 key 值）"""
    keys = USER_API_KEYS.get(user_id, [])
    return [
        {**k, "key": k["key"][:12] + "..."}
        for k in keys
    ]


def delete_api_key_for_user(user_id: str, key_id: str) -> bool:
    """删除指定 API key，成功返回 True，未找到返回 False"""
    keys = USER_API_KEYS.get(user_id, [])
    for i, k in enumerate(keys):
        if k["id"] == key_id:
            keys.pop(i)
            return True
    return False
