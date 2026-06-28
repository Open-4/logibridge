"""
auth.py — PostgreSQL 持久化认证（Railway Postgres + Vercel Serverless）
- 用 Railway Postgres 存储用户、设置、API Key
- JWT 签发/验证
- 内存后备（数据库不可用时）
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

# ── 数据库配置 ──────────────────────────────────────────────────────────
_DATABASE_URL = os.getenv("DATABASE_URL", "")

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

# ── PostgreSQL 连接 ─────────────────────────────────────────────────────

_db_conn = None
_DB_ENABLED = False

def _get_db():
    global _db_conn, _DB_ENABLED
    if not _DATABASE_URL:
        _DB_ENABLED = False
        return None
    try:
        if _db_conn is None or _db_conn.closed:
            import psycopg2
            _db_conn = psycopg2.connect(_DATABASE_URL)
            _db_conn.autocommit = True
            _DB_ENABLED = True
        return _db_conn
    except Exception as e:
        _DB_ENABLED = False
        print(f"[auth] PostgreSQL 连接失败 (回退内存): {e}")
        return None

def _init_db():
    db = _get_db()
    if not db:
        return
    try:
        cur = db.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                hashed_password TEXT NOT NULL,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS user_settings (
                user_id TEXT PRIMARY KEY,
                settings_json TEXT NOT NULL DEFAULT '{}'
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS api_keys (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                name TEXT NOT NULL DEFAULT '',
                key_value TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)
        cur.close()
        print("[auth] PostgreSQL 数据库表已就绪")
    except Exception as e:
        print(f"[auth] 数据库初始化失败: {e}")

# 模块加载时初始化
_init_db()

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
            cur = db.cursor()
            cur.execute("SELECT id, email, hashed_password, name, created_at FROM users WHERE email = %s", (email_norm,))
            row = cur.fetchone()
            cur.close()
            if row:
                return {"id": row[0], "email": row[1], "hashed_password": row[2], "name": row[3], "createdAt": row[4]}
        except Exception:
            pass
    return _MEMORY_USERS_BY_EMAIL.get(email_norm)

def create_user(email: str, password: str, name: str) -> dict:
    now = _now_iso()
    uid = _new_id()
    email_norm = email.lower().strip()
    hashed = hash_password(password)
    user = {"id": uid, "email": email_norm, "hashed_password": hashed, "name": name.strip(), "createdAt": now}

    db = _get_db()
    if db:
        try:
            cur = db.cursor()
            cur.execute(
                "INSERT INTO users (id, email, hashed_password, name, created_at) VALUES (%s, %s, %s, %s, %s)",
                (uid, email_norm, hashed, name.strip(), now),
            )
            cur.close()
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
            cur = db.cursor()
            cur.execute("SELECT settings_json FROM user_settings WHERE user_id = %s", (user_id,))
            row = cur.fetchone()
            cur.close()
            if row:
                settings = json.loads(row[0])
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
            cur = db.cursor()
            cur.execute(
                "INSERT INTO user_settings (user_id, settings_json) VALUES (%s, %s) ON CONFLICT (user_id) DO UPDATE SET settings_json = EXCLUDED.settings_json",
                (user_id, json.dumps(current, ensure_ascii=False)),
            )
            cur.close()
        except Exception:
            pass
    _MEMORY_SETTINGS[user_id] = current
    return current

# ── API Key ─────────────────────────────────────────────────────────────

def create_api_key_for_user(user_id: str, name: str = "") -> dict:
    key_id = _new_id(); key_value = f"lgb_{uuid.uuid4().hex}"; now = _now_iso()
    ak = {"id": key_id, "userId": user_id, "name": name.strip() or f"API Key {key_id[:8]}",
          "key": key_value, "createdAt": now, "lastUsedAt": None}
    db = _get_db()
    if db:
        try:
            cur = db.cursor()
            cur.execute(
                "INSERT INTO api_keys (id, user_id, name, key_value, created_at) VALUES (%s, %s, %s, %s, %s)",
                (key_id, user_id, ak["name"], key_value, now),
            )
            cur.close()
        except Exception:
            pass
    _MEMORY_API_KEYS.setdefault(user_id, []).append(ak)
    return ak

def list_api_keys_for_user(user_id: str) -> list[dict]:
    db = _get_db()
    if db:
        try:
            cur = db.cursor()
            cur.execute("SELECT id, user_id, name, key_value, created_at FROM api_keys WHERE user_id = %s", (user_id,))
            rows = cur.fetchall()
            cur.close()
            return [{"id": r[0], "userId": r[1], "name": r[2], "key": r[3][:12]+"...", "createdAt": r[4], "lastUsedAt": None} for r in rows]
        except Exception:
            pass
    return [dict(k, key=k["key"][:12]+"...") for k in _MEMORY_API_KEYS.get(user_id, [])]

def delete_api_key_for_user(user_id: str, key_id: str) -> bool:
    db = _get_db()
    if db:
        try:
            cur = db.cursor()
            cur.execute("DELETE FROM api_keys WHERE id = %s AND user_id = %s", (key_id, user_id))
            deleted = cur.rowcount > 0
            cur.close()
            if deleted: return True
        except Exception:
            pass
    keys = _MEMORY_API_KEYS.get(user_id, [])
    for i, k in enumerate(keys):
        if k["id"] == key_id: keys.pop(i); return True
    return False