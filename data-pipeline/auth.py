"""
auth.py — 用户认证模块（JSON 文件持久化，适配 Vercel Serverless）
- 密码哈希 (bcrypt)
- JWT 签发 & 验证（JWT 中内嵌用户信息，无需每次查库）
- FastAPI 依赖项：get_current_user
- 用户设置 / API Key 管理
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

# ── JWT 配置 ────────────────────────────────────────────────────────
SECRET_KEY = os.getenv(
    "LOGIBRIDGE_JWT_SECRET",
    "logibridge-dev-secret-key-do-not-use-in-production",
)
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24

# ── JSON 文件持久化（Vercel /tmp 可写）───────────────
_DATA_DIR = "/tmp"
_STORE_FILE = os.path.join(_DATA_DIR, "logibridge_store.json")
_LOG_FILE = os.path.join(_DATA_DIR, "auth_debug.log")

def _log(msg: str):
    """写入调试日志"""
    try:
        with open(_LOG_FILE, "a") as lf:
            from datetime import datetime, timezone
            lf.write(f"{datetime.now(timezone.utc).isoformat()} {msg}\n")
    except Exception:
        pass

def _load_store():
    """加载持久化数据，失败返回空字典"""
    try:
        _log(f"_load_store: checking path={_STORE_FILE} exists={os.path.exists(_STORE_FILE)}")
        if os.path.exists(_STORE_FILE):
            with open(_STORE_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            _log(f"_load_store: loaded {len(data.get('users',{}))} users")
            return data
    except Exception as e:
        _log(f"_load_store ERROR: {e}")
    return {"users": {}, "users_by_email": {}, "settings": {}, "api_keys": {},
            "consultations": {}, "messages": {}}

def _save_store(data: dict):
    """写入持久化文件"""
    try:
        os.makedirs(_DATA_DIR, exist_ok=True)
        with open(_STORE_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        _log(f"_save_store: saved {len(data.get('users',{}))} users, filesize={os.path.getsize(_STORE_FILE)}")
    except Exception as e:
        _log(f"_save_store ERROR: {e}")

# ── 全局存储（服务启动时加载，运行时操作，每次写操作后持久化）──
_store = _load_store()
USERS = _store.setdefault("users", {})
USERS_BY_EMAIL = _store.setdefault("users_by_email", {})
USER_SETTINGS = _store.setdefault("settings", {})
USER_API_KEYS = _store.setdefault("api_keys", {})
CONSULTATIONS_STORE = _store.setdefault("consultations", {})
MESSAGES_STORE = _store.setdefault("messages", {})

# ── Bearer token ───────────────────────────────────────────────────
bearer_scheme = HTTPBearer(auto_error=False)

# ── Pydantic 模型 ──────────────────────────────────────────────────

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

# ── 工具 ────────────────────────────────────────────────────────────

def _now_iso(): return datetime.now(timezone.utc).isoformat()
def _new_id(): return uuid.uuid4().hex[:12]

# ── 密码 ────────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    import bcrypt
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(plain: str, hashed: str) -> bool:
    import bcrypt
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False

# ── JWT ─────────────────────────────────────────────────────────────

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def decode_access_token(token: str) -> dict:
    try: return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="无效或过期的 token",
                            headers={"WWW-Authenticate": "Bearer"})

# ── 依赖项（从 JWT 中直接提取用户，不查库）───────────────────────

async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> Optional[dict]:
    """从 JWT payload 中提取用户信息，无需查库"""
    if credentials is None: return None
    payload = decode_access_token(credentials.credentials)
    user_id = payload.get("sub")
    email = payload.get("email")
    name = payload.get("name")
    created_at = payload.get("createdAt")
    if not user_id: return None
    return {"id": user_id, "email": email or "", "name": name or "", "createdAt": created_at or ""}

async def get_current_user_required(
    current_user: Optional[dict] = Depends(get_current_user),
) -> dict:
    if current_user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="需要登录", headers={"WWW-Authenticate": "Bearer"})
    return current_user

# ── 用户 CRUD ──────────────────────────────────────────────────────

def get_user_by_id(user_id: str) -> Optional[dict]:
    # 重新加载最新存储
    global USERS
    s = _load_store(); USERS = s.get("users", {})
    return USERS.get(user_id)

def get_user_by_email(email: str) -> Optional[dict]:
    global USERS_BY_EMAIL
    s = _load_store(); USERS_BY_EMAIL = s.get("users_by_email", {})
    return USERS_BY_EMAIL.get(email.lower().strip())

def create_user(email: str, password: str, name: str) -> dict:
    global USERS, USERS_BY_EMAIL
    s = _load_store(); USERS = s.setdefault("users", {}); USERS_BY_EMAIL = s.setdefault("users_by_email", {})

    user_id = _new_id(); now = _now_iso()
    email_norm = email.lower().strip()
    user = {"id": user_id, "email": email_norm, "hashed_password": hash_password(password),
            "name": name.strip(), "createdAt": now}
    USERS[user_id] = user
    USERS_BY_EMAIL[email_norm] = user
    _save_store(s)
    return user

def authenticate_user(email: str, password: str) -> Optional[dict]:
    user = get_user_by_email(email)
    if not user: return None
    if not verify_password(password, user["hashed_password"]): return None
    return user

def user_to_public(user: dict) -> UserPublic:
    return UserPublic(id=user["id"], email=user["email"], name=user["name"], createdAt=user["createdAt"])

# ── 用户设置 ────────────────────────────────────────────────────────

def get_user_settings(user_id: str) -> dict:
    global USER_SETTINGS
    s = _load_store(); USER_SETTINGS = s.setdefault("settings", {})
    settings = USER_SETTINGS.get(user_id)
    return {**DEFAULT_USER_SETTINGS, **settings} if settings else dict(DEFAULT_USER_SETTINGS)

def update_user_settings(user_id: str, updates: dict) -> dict:
    global USER_SETTINGS
    s = _load_store(); USER_SETTINGS = s.setdefault("settings", {})
    current = get_user_settings(user_id)
    for k, v in updates.items():
        if v is not None and k in DEFAULT_USER_SETTINGS: current[k] = v
    USER_SETTINGS[user_id] = current; _save_store(s)
    return current

# ── API Key ─────────────────────────────────────────────────────────

def create_api_key_for_user(user_id: str, name: str = "") -> dict:
    global USER_API_KEYS
    s = _load_store(); USER_API_KEYS = s.setdefault("api_keys", {})
    key_id = _new_id(); key_value = f"lgb_{uuid.uuid4().hex}"; now = _now_iso()
    ak = {"id": key_id, "userId": user_id, "name": name.strip() or f"API Key {key_id[:8]}",
          "key": key_value, "createdAt": now, "lastUsedAt": None}
    USER_API_KEYS.setdefault(user_id, []).append(ak); _save_store(s)
    return ak

def list_api_keys_for_user(user_id: str) -> list[dict]:
    global USER_API_KEYS
    s = _load_store(); USER_API_KEYS = s.setdefault("api_keys", {})
    return [dict(k, key=k["key"][:12]+"...") for k in USER_API_KEYS.get(user_id, [])]

def delete_api_key_for_user(user_id: str, key_id: str) -> bool:
    global USER_API_KEYS
    s = _load_store(); USER_API_KEYS = s.setdefault("api_keys", {})
    keys = USER_API_KEYS.get(user_id, [])
    for i, k in enumerate(keys):
        if k["id"] == key_id: keys.pop(i); _save_store(s); return True
    return False

# ── 咨询存储（共享给 api_server.py）──────────────────────────────

def get_consultation_store():
    global CONSULTATIONS_STORE, MESSAGES_STORE
    s = _load_store(); CONSULTATIONS_STORE = s.setdefault("consultations", {}); MESSAGES_STORE = s.setdefault("messages", {})
    return CONSULTATIONS_STORE, MESSAGES_STORE

# 初始化：启动时加载
_init_store = _load_store()
USERS = _init_store.get("users", {})
USERS_BY_EMAIL = _init_store.get("users_by_email", {})
USER_SETTINGS = _init_store.get("settings", {})
_log(f"模块初始化完成: {len(USERS)} 用户, {len(USERS_BY_EMAIL)} 邮箱索引, tmp_writable={os.access('/tmp', os.W_OK)}")
