"""DB-backed rate limiting for unauthenticated, brute-force-prone endpoints
(login, MFA verification, self-registration).

Reuses the system_events table's "durable attempt counter" pattern already
established by services/system_reset_service.py (system resets) and
services/ai_provider_service.py (AI test connection) rather than adding a
new in-memory limiter or a third-party dependency — a durable, DB-backed
counter survives backend restarts and works the same whether there's one
backend replica or several behind a load balancer, unlike a process-local
counter.

Keyed by client IP address (not username) since these endpoints run before
authentication — a username can't be trusted yet, but an IP address lets a
single source get locked out without one attacker being able to lock out a
real user by spamming login attempts under their username.
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from models.system_event import SystemEvent

LOGIN_EVENT_TYPE = "auth_login_attempt"
MFA_EVENT_TYPE = "auth_mfa_attempt"
REGISTER_EVENT_TYPE = "auth_register_attempt"

LOGIN_MAX_ATTEMPTS = 10
LOGIN_WINDOW_MINUTES = 15

MFA_MAX_ATTEMPTS = 10
MFA_WINDOW_MINUTES = 15

REGISTER_MAX_ATTEMPTS = 5
REGISTER_WINDOW_MINUTES = 60

_UNKNOWN_IP = "unknown"


def _key(ip_address: str | None) -> str:
    return ip_address or _UNKNOWN_IP


def recent_attempt_count(db: Session, event_type: str, ip_address: str | None, window_minutes: int) -> int:
    window_start = datetime.now(timezone.utc) - timedelta(minutes=window_minutes)
    return (
        db.query(SystemEvent)
        .filter(
            SystemEvent.event_type == event_type,
            SystemEvent.details["ip"].astext == _key(ip_address),
            SystemEvent.created_at >= window_start,
        )
        .count()
    )


def record_attempt(db: Session, event_type: str, ip_address: str | None, outcome: str) -> None:
    db.add(SystemEvent(event_type=event_type, details={"ip": _key(ip_address), "outcome": outcome}))
    db.commit()


def is_rate_limited(db: Session, event_type: str, ip_address: str | None, max_attempts: int, window_minutes: int) -> bool:
    return recent_attempt_count(db, event_type, ip_address, window_minutes) >= max_attempts
