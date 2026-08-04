"""Pydantic request/response schemas for the auth API."""
from datetime import date, datetime
from decimal import Decimal

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


class InvoiceOut(BaseModel):
    id: int
    filename: str
    upload_date: datetime
    invoice_date: date
    supplier: str
    amount: Decimal
    category_id: int | None
    notes: str | None
    signed: bool
    signed_pdf_path: str | None
    financial_year_id: int | None
    reviewed: bool
    duplicate_flag: bool
    created_by: int
    created_at: datetime

    model_config = {"from_attributes": True}


class InvoiceUpdate(BaseModel):
    invoice_date: date | None = None
    supplier: str | None = Field(default=None, min_length=1, max_length=255)
    amount: Decimal | None = Field(default=None, gt=0)
    category_id: int | None = None
    notes: str | None = None


class InvoiceSignRequest(BaseModel):
    signature_image: str = Field(min_length=1, description="Base64 PNG, data URL prefix optional")
    date: date
    page: int = Field(ge=1, description="1-indexed page number to place the signature on")
    x: float = Field(ge=0, le=100, description="Left edge of the signature box, % of page width")
    y: float = Field(ge=0, le=100, description="Top edge of the signature box, % of page height")
    width: float = Field(gt=0, le=100, description="Signature box width, % of page width")
    height: float = Field(gt=0, le=100, description="Signature box height, % of page height")


class SettingOut(BaseModel):
    id: int
    key: str
    value: str
    updated_by: int | None
    updated_at: datetime

    model_config = {"from_attributes": True}


class SettingUpdate(BaseModel):
    value: str = Field(min_length=1, max_length=500)


class DashboardFinancialYear(BaseModel):
    id: int
    label: str
    start_date: date
    end_date: date


class DashboardMonthBreakdown(BaseModel):
    year: int
    month: int
    month_label: str
    actual_spend: Decimal
    actual_income: Decimal
    forecast_spend: Decimal
    planned_project_cost: Decimal
    is_elapsed: bool


class DashboardPlannedProject(BaseModel):
    id: int
    name: str
    description: str | None
    estimated_cost: Decimal
    expected_month: date
    expected_month_label: str


class DashboardUpcomingInvoice(BaseModel):
    supplier: str
    category_id: int | None
    category_name: str | None
    category_colour: str | None
    estimated_amount: Decimal
    expected_around: date


class DashboardRecentActivity(BaseModel):
    id: int
    invoice_date: date
    supplier: str
    amount: Decimal
    category_id: int | None
    category_name: str | None
    category_colour: str | None


class DashboardForecastCategory(BaseModel):
    category_id: int | None
    category_name: str
    category_colour: str | None
    monthly_average: Decimal
    remaining_months: int
    remaining_months_total: Decimal


class DashboardSummary(BaseModel):
    financial_year: DashboardFinancialYear
    total_invoices_confirmed: int
    total_spent: Decimal
    total_contributions: Decimal
    current_balance: Decimal
    target_reserve: Decimal
    balance_status: str  # "above" | "near" | "below"
    monthly_average_cost: Decimal
    monthly_breakdown: list[DashboardMonthBreakdown]
    planned_projects: list[DashboardPlannedProject]
    upcoming_expected_invoices: list[DashboardUpcomingInvoice]
    recent_activity: list[DashboardRecentActivity]
    forecast_by_category: list[DashboardForecastCategory]


class DashboardNotification(BaseModel):
    id: str
    type: str
    severity: str  # "warning" | "urgent"
    message: str
    link: str | None
