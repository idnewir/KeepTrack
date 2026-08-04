"""Symmetric encryption for sensitive columns at rest (e.g. users.mfa_secret)."""
from cryptography.fernet import Fernet

from config import settings

_fernet = Fernet(settings.mfa_encryption_key.encode())


def encrypt_secret(plaintext: str) -> str:
    return _fernet.encrypt(plaintext.encode()).decode()


def decrypt_secret(ciphertext: str) -> str:
    return _fernet.decrypt(ciphertext.encode()).decode()
