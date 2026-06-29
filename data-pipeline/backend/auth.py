"""
auth.py — Turso 边缘数据库持久化认证（适配 Vercel Serverless）
- Turso 是免费 SQLite 边缘数据库，全球分布
- JWT 签发/验证
- 内存后备
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

# ── Turso 数据库 ─────────────────────────────────────────────────────────
_TURSO_URL = os.getenv("TURSO_DATABASE_URL", "")
_TURSO_TOKEN = os.getenv("TURSO_AUTH_TOKEN", "")

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

# ── Turso 连接 ──────────────────────────────────────────────────────────

_turso_client = None
_DB_ENABLED = False

def _get_db():
    global _turso_client, _DB_ENABLED
    if not _TURSO_URL or not _TURSO_TOKEN:
        _DB_ENABLED = False
        return None
    try:
        if _turso_client is None:
            import libsql_client
            _turso_client = libsql_client.create_client_sync(
                url=_TURSO_URL,
                auth_token=_TURSO_TOKEN,
            )
            # 初始化表
            _turso_client.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    email TEXT UNIQUE NOT NULL,
                    hashed_password TEXT NOT NULL,
                    name TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
            """)
            _turso_client.execute("""
                CREATE TABLE IF NOT EXISTS user_settings (
                    user_id TEXT PRIMARY KEY,
                    settings_json TEXT NOT NULL DEFAULT '{}'
                )
            """)
            _turso_client.execute("""
                CREATE TABLE IF NOT EXISTS api_keys (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    name TEXT NOT NULL DEFAULT '',
                    key_value TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
            """)
            _DB_ENABLED = True
            print("[auth] Turso 数据库已连接")
        return _turso_client
    except Exception as e:
        _DB_ENABLED = False
        print(f"[auth] Turso 连接失败 (回退内存): {e}")
        return None

# ── 内存后备 ────────────────────────────────────────────────────────────
_MEMORY_USERS: dict[str, dict] = {}
_MEMORY_USERS_BY_EMAIL: dict[str, dict] = {}
_MEMORY_SETTINGS: dict[str, dict] = {}
_MEMORY_API_KEYS: dict[str, list[dict]] = {}

# ── 密码 ────────────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    import bcrypt
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(plain: str, hashed: str) -> bool:
    import bcrypt
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False

# ── JWT ─────────────────────────────────────────────────────────────────

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

# ── 依赖项 ─────────────────────────────────────────────────────────────

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
    }

async def get_current_user_required(
    current_user: Optional[dict] = Depends(get_current_user),
) -> dict:
    if current_user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="请先登录", headers={"WWW-Authenticate": "Bearer"})
    return current_user

# ── 用户 CRUD ──────────────────────────────────────────────────────────

def get_user_by_email(email: str) -> Optional[dict]:
    email_norm = email.lower().strip()
    db = _get_db()
    if db:
        try:
            rs = db.execute("SELECT id, email, hashed_password, name, created_at FROM users WHERE email = ?", [email_norm])
            if rs.rows:
                r = rs.rows[0]
                return {"id": r[0], "email": r[1], "hashed_password": r[2], "name": r[3], "createdAt": r[4]}
        except Exception:
            pass
    return _MEMORY_USERS_BY_EMAIL.get(email_norm)

def create_user(email: str, password: str, name: str) -> dict:
    now = _now_iso(); uid = _new_id()
    email_norm = email.lower().strip()
    hashed = hash_password(password)
    user = {"id": uid, "email": email_norm, "hashed_password": hashed, "name": name.strip(), "createdAt": now}
    db = _get_db()
    if db:
        try:
            db.execute("INSERT INTO users (id, email, hashed_password, name, created_at) VALUES (?, ?, ?, ?, ?)", [uid, email_norm, hashed, name.strip(), now])
        except Exception:
            pass
    _MEMORY_USERS[uid] = user
    _MEMORY_USERS_BY_EMAIL[email_norm] = user
    return user

def authenticate_user(email: str, password: str) -> Optional[dict]:
    user = get_user_by_email(email)
    if not user: return None
    if not verify_password(password, user["hashed_password"]): return None
    return user

def user_to_public(user: dict) -> UserPublic:
    return UserPublic(id=user["id"], email=user["email"], name=user["name"], createdAt=user["createdAt"])

# ── 用户设置 ────────────────────────────────────────────────────────────

def get_user_settings(user_id: str) -> dict:
    db = _get_db()
    if db:
        try:
            rs = db.execute("SELECT settings_json FROM user_settings WHERE user_id = ?", [user_id])
            if rs.rows:
                settings = json.loads(rs.rows[0][0])
                return {**DEFAULT_USER_SETTINGS, **settings}
        except Exception:
            pass
    settings = _MEMORY_SETTINGS.get(user_id)
    return {**DEFAULT_USER_SETTINGS, **settings} if settings else dict(DEFAULT_USER_SETTINGS)

def update_user_settings(user_id: str, updates: dict) -> dict:
    current = get_user_settings(user_id)
    for k, v in updates.items():
        if v is not None and k in DEFAULT_USER_SETTINGS: current[k] = v
    db = _get_db()
    if db:
        try:
            db.execute("INSERT OR REPLACE INTO user_settings (user_id, settings_json) VALUES (?, ?)", [user_id, json.dumps(current, ensure_ascii=False)])
        except Exception:
            pass
    _MEMORY_SETTINGS[user_id] = current
    return current

# ── API Key ─────────────────────────────────────────────────────────────

def create_api_key_for_user(user_id: str, name: str = "") -> dict:
    key_id = _new_id(); key_value = f"lgb_{uuid.uuid4().hex}"; now = _now_iso()
    ak = {"id": key_id, "userId": user_id, "name": name.strip() or f"API Key {key_id[:8]}", "key": key_value, "createdAt": now, "lastUsedAt": None}
    db = _get_db()
    if db:
        try:
            db.execute("INSERT INTO api_keys (id, user_id, name, key_value, created_at) VALUES (?, ?, ?, ?, ?)", [key_id, user_id, ak["name"], key_value, now])
        except Exception:
            pass
    _MEMORY_API_KEYS.setdefault(user_id, []).append(ak)
    return ak

def list_api_keys_for_user(user_id: str) -> list[dict]:
    db = _get_db()
    if db:
        try:
            rs = db.execute("SELECT id, user_id, name, key_value, created_at FROM api_keys WHERE user_id = ?", [user_id])
            return [{"id": r[0], "userId": r[1], "name": r[2], "key": r[3][:12]+"...", "createdAt": r[4], "lastUsedAt": None} for r in rs.rows]
        except Exception:
            pass
    return [dict(k, key=k["key"][:12]+"...") for k in _MEMORY_API_KEYS.get(user_id, [])]

def delete_api_key_for_user(user_id: str, key_id: str) -> bool:
    db = _get_db()
    if db:
        try:
            rs = db.execute("DELETE FROM api_keys WHERE id = ? AND user_id = ?", [key_id, user_id])
            return rs.rows_affected > 0
        except Exception:
            pass
    keys = _MEMORY_API_KEYS.get(user_id, [])
    for i, k in enumerate(keys):
        if k["id"] == key_id: keys.pop(i); return True
    return False