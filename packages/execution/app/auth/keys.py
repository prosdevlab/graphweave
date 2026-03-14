"""API key generation and hashing."""

from __future__ import annotations

import hashlib
import secrets

KEY_PREFIX = "gw_"


def generate_api_key() -> tuple[str, str]:
    """Generate a raw API key and its SHA-256 hash.

    Returns ``(raw_key, key_hash)``.  The raw key is returned to the
    caller **once** — only the hash is stored.
    """
    random_part = secrets.token_hex(32)  # 64 hex chars
    raw_key = f"{KEY_PREFIX}{random_part}"
    key_hash = hash_key(raw_key)
    return raw_key, key_hash


def hash_key(raw_key: str) -> str:
    """SHA-256 hex digest of a raw API key."""
    return hashlib.sha256(raw_key.encode()).hexdigest()


def get_key_display_prefix(raw_key: str) -> str:
    """First 10 characters of the raw key for safe display."""
    return raw_key[:10]
