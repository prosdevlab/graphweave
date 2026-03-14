"""Tests for API key generation and hashing."""

from __future__ import annotations

from app.auth.keys import generate_api_key, get_key_display_prefix, hash_key


def test_key_format():
    raw_key, _ = generate_api_key()
    assert raw_key.startswith("gw_")
    assert len(raw_key) == 67  # "gw_" (3) + 64 hex chars


def test_keys_are_unique():
    key1, _ = generate_api_key()
    key2, _ = generate_api_key()
    assert key1 != key2


def test_hash_is_deterministic():
    raw_key = "gw_abc123"
    assert hash_key(raw_key) == hash_key(raw_key)


def test_different_keys_different_hashes():
    _, hash1 = generate_api_key()
    _, hash2 = generate_api_key()
    assert hash1 != hash2


def test_prefix_extraction():
    raw_key = "gw_abcdefghij1234567890"
    prefix = get_key_display_prefix(raw_key)
    assert prefix == "gw_abcdefg"
    assert len(prefix) == 10
