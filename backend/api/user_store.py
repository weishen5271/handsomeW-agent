import hashlib
import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

DB_PATH = Path(__file__).resolve().parents[1] / "data" / "app.db"
SESSION_TTL_DAYS = 7
PBKDF2_ROUNDS = 120_000


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _to_iso(ts: datetime) -> str:
    return ts.isoformat()


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('admin', 'user')),
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS user_llm_configs (
                user_id INTEGER PRIMARY KEY,
                provider TEXT NOT NULL,
                model TEXT NOT NULL,
                base_url TEXT NOT NULL,
                api_key TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )
        conn.commit()


def _hash_password(password: str, salt_hex: str) -> str:
    hashed = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        bytes.fromhex(salt_hex),
        PBKDF2_ROUNDS,
    )
    return hashed.hex()


def _public_user(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "username": row["username"],
        "role": row["role"],
        "created_at": row["created_at"],
    }


def _cleanup_expired_sessions(conn: sqlite3.Connection) -> None:
    conn.execute("DELETE FROM sessions WHERE expires_at <= ?", (_to_iso(_utc_now()),))


def count_users() -> int:
    with _connect() as conn:
        row = conn.execute("SELECT COUNT(*) AS cnt FROM users").fetchone()
        return int(row["cnt"] if row else 0)


def get_user_by_username(username: str) -> dict[str, Any] | None:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        if row is None:
            return None
        return dict(row)


def get_user_by_id(user_id: int) -> dict[str, Any] | None:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if row is None:
            return None
        return dict(row)


def create_user(username: str, password: str, role: str = "user") -> dict[str, Any]:
    salt = os.urandom(16).hex()
    password_hash = _hash_password(password, salt)
    now = _to_iso(_utc_now())

    with _connect() as conn:
        cursor = conn.execute(
            "INSERT INTO users(username, password_hash, salt, role, created_at) VALUES (?, ?, ?, ?, ?)",
            (username, password_hash, salt, role, now),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM users WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return _public_user(row)


def register_user(username: str, password: str) -> dict[str, Any]:
    role = "admin" if count_users() == 0 else "user"
    return create_user(username=username, password=password, role=role)


def verify_user_password(username: str, password: str) -> dict[str, Any] | None:
    user = get_user_by_username(username)
    if user is None:
        return None

    expected = _hash_password(password, user["salt"])
    if not secrets.compare_digest(expected, user["password_hash"]):
        return None

    return {
        "id": user["id"],
        "username": user["username"],
        "role": user["role"],
        "created_at": user["created_at"],
    }


def create_session(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    now = _utc_now()
    expires = now + timedelta(days=SESSION_TTL_DAYS)

    with _connect() as conn:
        _cleanup_expired_sessions(conn)
        conn.execute(
            "INSERT INTO sessions(token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
            (token, user_id, _to_iso(now), _to_iso(expires)),
        )
        conn.commit()

    return token


def revoke_session(token: str) -> None:
    with _connect() as conn:
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
        conn.commit()


def get_user_by_token(token: str) -> dict[str, Any] | None:
    with _connect() as conn:
        _cleanup_expired_sessions(conn)
        row = conn.execute(
            """
            SELECT u.id, u.username, u.role, u.created_at
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token = ?
            """,
            (token,),
        ).fetchone()
        conn.commit()

        if row is None:
            return None

        return _public_user(row)


def list_users() -> list[dict[str, Any]]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT id, username, role, created_at FROM users ORDER BY created_at ASC"
        ).fetchall()
        return [_public_user(row) for row in rows]


def update_user(
    user_id: int,
    username: str | None = None,
    role: str | None = None,
    password: str | None = None,
) -> dict[str, Any] | None:
    with _connect() as conn:
        current = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if current is None:
            return None

        next_username = username if username is not None else current["username"]
        next_role = role if role is not None else current["role"]
        next_hash = current["password_hash"]
        next_salt = current["salt"]

        if password is not None:
            next_salt = os.urandom(16).hex()
            next_hash = _hash_password(password, next_salt)

        conn.execute(
            """
            UPDATE users
            SET username = ?, role = ?, password_hash = ?, salt = ?
            WHERE id = ?
            """,
            (next_username, next_role, next_hash, next_salt, user_id),
        )
        conn.commit()

        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        return _public_user(row)


def delete_user(user_id: int) -> bool:
    with _connect() as conn:
        conn.execute("DELETE FROM user_llm_configs WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
        cursor = conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
        conn.commit()
        return cursor.rowcount > 0


def get_user_llm_config(user_id: int) -> dict[str, Any] | None:
    with _connect() as conn:
        row = conn.execute(
            """
            SELECT user_id, provider, model, base_url, api_key, created_at, updated_at
            FROM user_llm_configs
            WHERE user_id = ?
            """,
            (user_id,),
        ).fetchone()
        if row is None:
            return None
        return dict(row)


def upsert_user_llm_config(
    user_id: int,
    provider: str,
    model: str,
    base_url: str,
    api_key: str | None,
) -> dict[str, Any]:
    now = _to_iso(_utc_now())
    with _connect() as conn:
        existing = conn.execute(
            "SELECT api_key, created_at FROM user_llm_configs WHERE user_id = ?",
            (user_id,),
        ).fetchone()

        final_api_key = api_key
        created_at = now
        if existing is not None:
            if api_key is None:
                final_api_key = existing["api_key"]
            created_at = existing["created_at"]
            conn.execute(
                """
                UPDATE user_llm_configs
                SET provider = ?, model = ?, base_url = ?, api_key = ?, updated_at = ?
                WHERE user_id = ?
                """,
                (provider, model, base_url, final_api_key, now, user_id),
            )
        else:
            conn.execute(
                """
                INSERT INTO user_llm_configs(user_id, provider, model, base_url, api_key, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (user_id, provider, model, base_url, final_api_key, created_at, now),
            )
        conn.commit()

    row = get_user_llm_config(user_id)
    if row is None:
        raise RuntimeError("保存用户 LLM 配置失败")
    return row
