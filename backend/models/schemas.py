"""Pydantic request/response schemas for the auth API."""
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from models.user import ROLES

ASSIGNABLE_ROLES = tuple(r for r in ROLES if r != "superadmin")


class UserOut(BaseModel):
    id: int
    username: str
    email: str
    role: str
    approved: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class SetupRequest(BaseModel):
    username: str = Field(min_length=3, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8, max_length=255)


class SetupResponse(BaseModel):
    user: UserOut
    mfa_secret: str
    otpauth_uri: str
    qr_code_png_base64: str


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    # False only for the Superadmin break-glass account, which has no MFA
    # step — see docs/decisions-log.md. Driven entirely by the stored role
    # looked up server-side; nothing in the request can influence it.
    mfa_required: bool
    token_type: str = "bearer"
    expires_in_minutes: int
    temp_token: str | None = None
    access_token: str | None = None


class MFAVerifyRequest(BaseModel):
    temp_token: str
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in_minutes: int


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8, max_length=255)


class RegisterResponse(BaseModel):
    message: str
    user: UserOut
    mfa_secret: str
    otpauth_uri: str
    qr_code_png_base64: str


class ApproveUserRequest(BaseModel):
    role: str = Field(description=f"One of: {', '.join(ASSIGNABLE_ROLES)}")


class SetupStatusResponse(BaseModel):
    setup_required: bool


class CategoryOut(BaseModel):
    id: int
    name: str
    colour: str
    active: bool

    model_config = {"from_attributes": True}


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    colour: str = Field(pattern=r"^#[0-9A-Fa-f]{6}$")


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    colour: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
