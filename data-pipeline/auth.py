"""
auth.py — 用户认证模块（SQLite 持久化）
- 密码哈希 (bcrypt)
- JWT 签发 & 验证
- FastAPI 依赖项：get_current_user
- 用户设置 / API Key 管理
"""

from __future__ import annotations

import json
import os
import uuid
import sqlite3
import threading
from datetime import datetime, timedelta, timezone
from typing import Optional
from contextlib import contextmanager

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
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24

# ── SQLite 数据库 ───────────────────────────────────────────────────────────
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logibridge.db")
_local = threading.local()


def _get_db() -> sqlite3.Connection:
    if not hasattr(_local, "conn") or _local.conn is None:
        _local.conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        _local.conn.row_factory = sqlite3.Row
        _local.conn.execute("PRAGMA journal_mode=WAL")
        _local.conn.execute("PRAGMA foreign_keys=ON")
    return _local.conn


def init_db():
    """初始化数据库表"""
    db = _get_db()
    db.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            hashed_password TEXT NOT NULL,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS user_settings (
            user_id TEXT PRIMARY KEY,
            settings_json TEXT NOT NULL DEFAULT '{}',
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS api_keys (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL DEFAULT '',
            key_value TEXT NOT NULL,
            created_at TEXT NOT NULL,
            last_used_at TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS consultations (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            subject TEXT NOT NULL,
            category TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            consultation_id TEXT NOT NULL,
            sender_type TEXT NOT NULL,
            content TEXT NOT NULL,
            attachments_json TEXT NOT NULL DEFAULT '[]',
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL,
            FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE CASCADE
        );
    """)
    db.commit()

# 在模块加载时初始化数据库
try:
    init_db()
except Exception as e:
    print(f"[auth] 数据库初始化失败: {e}")

# ── Bearer token 提取器 ────────────────────────────────────────────────────
bearer_scheme = HTTPBearer(auto_error=False)

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

DEFAULT_USER_SETTINGS = {
    "language": "zh-CN",
    "currency": "USD",
    "default_incoterm": "FOB",
    "notify_by_email": True,
    "notify_by_sms": False,
    "notify_on_delay": True,
    "notify_on_risk": True,
}

# ── 工具函数 ───────────────────────────────────────────────────────────────

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def _new_id() -> str:
    return uuid.uuid4().hex[:12]

# ── 密码哈希 ────────────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    import bcrypt
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    import bcrypt
    try:
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception:
        return False

# ── JWT 操作 ────────────────────────────────────────────────────────────────

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def decode_access_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
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
    if credentials is None:
        return None
    payload = decode_access_token(credentials.credentials)
    user_id: str | None = payload.get("sub")
    if user_id is None:
        return None
    return get_user_by_id(user_id)

async def get_current_user_required(
    current_user: Optional[dict] = Depends(get_current_user),
) -> dict:
    if current_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="需要登录",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return current_user

# ── 用户 CRUD（SQLite 持久化）──────────────────────────────────────────────

def get_user_by_id(user_id: str) -> Optional[dict]:
    db = _get_db()
    row = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if not row:
        return None
    return {
        "id": row["id"],
        "email": row["email"],
        "hashed_password": row["hashed_password"],
        "name": row["name"],
        "createdAt": row["created_at"],
    }

def get_user_by_email(email: str) -> Optional[dict]:
    db = _get_db()
    row = db.execute("SELECT * FROM users WHERE email = ?", (email.lower().strip(),)).fetchone()
    if not row:
        return None
    return {
        "id": row["id"],
        "email": row["email"],
        "hashed_password": row["hashed_password"],
        "name": row["name"],
        "createdAt": row["created_at"],
    }

def create_user(email: str, password: str, name: str) -> dict:
    user_id = _new_id()
    now = _now_iso()
    email_normalized = email.lower().strip()
    hashed = hash_password(password)

    db = _get_db()
    db.execute(
        "INSERT INTO users (id, email, hashed_password, name, created_at) VALUES (?, ?, ?, ?, ?)",
        (user_id, email_normalized, hashed, name.strip(), now),
    )
    db.commit()

    return {
        "id": user_id,
        "email": email_normalized,
        "hashed_password": hashed,
        "name": name.strip(),
        "createdAt": now,
    }

def authenticate_user(email: str, password: str) -> Optional[dict]:
    user = get_user_by_email(email)
    if not user:
        return None
    if not verify_password(password, user["hashed_password"]):
        return None
    return user

def user_to_public(user: dict) -> UserPublic:
    return UserPublic(
        id=user["id"],
        email=user["email"],
        name=user["name"],
        createdAt=user["createdAt"],
    )

# ── 用户设置（SQLite 持久化）───────────────────────────────────────────────

def get_user_settings(user_id: str) -> dict:
    db = _get_db()
    row = db.execute("SELECT settings_json FROM user_settings WHERE user_id = ?", (user_id,)).fetchone()
    if row:
        try:
            return {**DEFAULT_USER_SETTINGS, **json.loads(row["settings_json"])}
        except Exception:
            pass
    return dict(DEFAULT_USER_SETTINGS)

def update_user_settings(user_id: str, updates: dict) -> dict:
    current = get_user_settings(user_id)
    for key, value in updates.items():
        if value is not None and key in DEFAULT_USER_SETTINGS:
            current[key] = value
    db = _get_db()
    db.execute(
        "INSERT OR REPLACE INTO user_settings (user_id, settings_json) VALUES (?, ?)",
        (user_id, json.dumps(current, ensure_ascii=False)),
    )
    db.commit()
    return current

# ── API Key 管理（SQLite 持久化）───────────────────────────────────────────

def create_api_key_for_user(user_id: str, name: str = "") -> dict:
    key_id = _new_id()
    key_value = f"lgb_{uuid.uuid4().hex}"
    now = _now_iso()

    db = _get_db()
    db.execute(
        "INSERT INTO api_keys (id, user_id, name, key_value, created_at) VALUES (?, ?, ?, ?, ?)",
        (key_id, user_id, name.strip() or f"API Key {key_id[:8]}", key_value, now),
    )
    db.commit()

    return {
        "id": key_id,
        "userId": user_id,
        "name": name.strip() or f"API Key {key_id[:8]}",
        "key": key_value,
        "createdAt": now,
        "lastUsedAt": None,
    }

def list_api_keys_for_user(user_id: str) -> list[dict]:
    db = _get_db()
    rows = db.execute("SELECT * FROM api_keys WHERE user_id = ? ORDER BY created_at DESC", (user_id,)).fetchall()
    return [
        {"id": r["id"], "userId": r["user_id"], "name": r["name"],
         "key": r["key_value"][:12] + "...",
         "createdAt": r["created_at"], "lastUsedAt": r["last_used_at"]}
        for r in rows
    ]

def delete_api_key_for_user(user_id: str, key_id: str) -> bool:
    db = _get_db()
    cursor = db.execute("DELETE FROM api_keys WHERE id = ? AND user_id = ?", (key_id, user_id))
    db.commit()
    return cursor.rowcount > 0

# ── 向后兼容：内存存储引用（api_server.py 直接导入） ──────────────────────
USERS_BY_EMAIL = {}  # 保留以避免导入错误，实际逻辑已迁移到 SQLite
