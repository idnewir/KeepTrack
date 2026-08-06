"""Password hashing and JWT helpers."""
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

from config import settings

# rounds=12 is pinned explicitly (rather than relying on passlib's own
# default, which is an implementation detail that could change between
# versions) to guarantee the minimum cost factor the security requirements
# call for.
_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)

SCOPE_MFA = "mfa"
SCOPE_ACCESS = "access"

# A valid bcrypt hash with no corresponding password, used to keep login's
# response time constant whether or not the username exists — otherwise the
# "no such user" fast path is measurably quicker than a real password check,
# leaking which usernames are registered. Computed once at import time.
DUMMY_PASSWORD_HASH = _pwd_context.hash("no-such-user-timing-safety-padding")


class TokenError(Exception):
    """Raised when a JWT is missing, malformed, expired, or has the wrong scope."""


def hash_password(password: str) -> str:
    return _pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return _pwd_context.verify(password, password_hash)


def create_token(*, subject: int, scope: str, expiry_minutes: int, extra_claims: dict | None = None) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(subject),
        "scope": scope,
        "iat": now,
        "exp": now + timedelta(minutes=expiry_minutes),
        **(extra_claims or {}),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str, *, expected_scope: str) -> dict:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise TokenError("Invalid or expired token") from exc

    if payload.get("scope") != expected_scope:
        raise TokenError("Token scope mismatch")

    return payload
