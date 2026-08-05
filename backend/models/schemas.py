"""Pydantic request/response schemas for the auth API."""
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, EmailStr, Field

from models.report import REPORT_TYPES
from models.user import ROLES

ASSIGNABLE_ROLES = tuple(r for r in ROLES if r != "superadmin")


class UserOut(BaseModel):
    id: int
    username: str
    email: str
    display_name: str | None = None
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


class ProfileUpdateRequest(BaseModel):
    display_name: str | None = Field(default=None, max_length=150)
    email: EmailStr


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=255)


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
    additional_text: str | None = Field(
        default=None, max_length=500, description="Optional free text stamped below the signature and date"
    )


class SettingOut(BaseModel):
    id: int
    key: str
    value: str | None
    updated_by: int | None
    updated_at: datetime

    model_config = {"from_attributes": True}


class SettingUpdate(BaseModel):
    value: str = Field(min_length=1, max_length=500)


class TerminologyOut(BaseModel):
    term_expenses: str
    term_income: str
    term_projects: str
    term_reconciliation: str
    term_reserve: str
    site_name: str


class TerminologyUpdate(BaseModel):
    term_expenses: str | None = Field(default=None, min_length=1, max_length=100)
    term_income: str | None = Field(default=None, min_length=1, max_length=100)
    term_projects: str | None = Field(default=None, min_length=1, max_length=100)
    term_reconciliation: str | None = Field(default=None, min_length=1, max_length=100)
    term_reserve: str | None = Field(default=None, min_length=1, max_length=100)
    site_name: str | None = Field(default=None, min_length=1, max_length=100)


class SetupAppStartDateRequest(BaseModel):
    app_start_date: date | None = None
    financial_year_start_month: int | None = Field(default=None, ge=1, le=12)


class DashboardFinancialYear(BaseModel):
    id: int
    label: str
    start_date: date
    end_date: date
    opening_balance: Decimal | None = None


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
    reserve_label: str
    reserve_calculation: str  # "automatic" | "manual"
    reserve_months: int | None = None  # months multiplier; only set when reserve_calculation is "automatic"
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


class FinancialYearOut(BaseModel):
    id: int
    label: str
    start_date: date
    end_date: date
    opening_balance: Decimal | None

    model_config = {"from_attributes": True}


class OpeningBalanceUpdate(BaseModel):
    opening_balance: Decimal = Field(ge=0)


class ContributionOut(BaseModel):
    id: int
    financial_year_id: int
    month: int
    group_name: str
    amount: Decimal
    recorded_by: int
    recorded_at: datetime

    model_config = {"from_attributes": True}


class ContributionCreate(BaseModel):
    financial_year_id: int
    month: int = Field(ge=1, le=12)
    group_name: str = Field(min_length=1, max_length=100)
    amount: Decimal = Field(gt=0)


class ContributionUpdate(BaseModel):
    month: int | None = Field(default=None, ge=1, le=12)
    group_name: str | None = Field(default=None, min_length=1, max_length=100)
    amount: Decimal | None = Field(default=None, gt=0)


class ContributionsMonthlySummaryRow(BaseModel):
    year: int
    month: int
    month_label: str
    breakdown: dict[str, Decimal]
    total: Decimal
    running_balance: Decimal


class ContributionsMonthlySummaryOut(BaseModel):
    financial_year_id: int
    opening_balance: Decimal | None
    groups: list[str]
    rows: list[ContributionsMonthlySummaryRow]


class ReconciliationCreate(BaseModel):
    financial_year_id: int
    month: date
    actual_balance: Decimal


class ReconciliationUpdate(BaseModel):
    discrepancy_notes: str | None = Field(default=None, min_length=1)
    # Admin-only correction of an already-reconciled month. actual_balance
    # requires edit_reason (enforced in the router, not here, since the
    # requirement is conditional on actual_balance being present at all).
    actual_balance: Decimal | None = None
    edit_reason: str | None = Field(default=None, min_length=1)


class ReconciliationOut(BaseModel):
    id: int
    financial_year_id: int
    month: date
    calculated_balance: Decimal
    actual_balance: Decimal
    discrepancy: Decimal
    discrepancy_notes: str | None
    suggested_reason: str | None
    reconciled_by: int
    reconciled_by_username: str | None
    reconciled_at: datetime
    edited_by: int | None = None
    edited_by_username: str | None = None
    edited_at: datetime | None = None
    edit_reason: str | None = None


class ProjectOut(BaseModel):
    id: int
    name: str
    description: str | None
    estimated_cost: Decimal
    expected_month: date
    financial_year_id: int | None
    created_by: int
    created_at: datetime
    active: bool
    completed: bool
    edited_by: int | None = None
    edited_at: datetime | None = None
    edit_reason: str | None = None
    admin_edit_notes: str | None = None

    model_config = {"from_attributes": True}


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    estimated_cost: Decimal = Field(gt=0)
    expected_month: date
    financial_year_id: int | None = None


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    estimated_cost: Decimal | None = Field(default=None, gt=0)
    expected_month: date | None = None
    financial_year_id: int | None = None
    # Admin-only unlock for editing a completed (otherwise locked) project.
    # edit_reason is required whenever admin_override is used (enforced in
    # the router, since the requirement is conditional).
    admin_override: bool = False
    edit_reason: str | None = Field(default=None, min_length=1)


class ReportOut(BaseModel):
    id: int
    title: str
    generated_by: int
    generated_by_username: str | None
    generated_at: datetime
    date_from: date
    date_to: date
    categories_included: list[int]
    years_included: int
    report_type: str
    parameters: dict

    model_config = {"from_attributes": True}


class ReportGenerateRequest(BaseModel):
    title: str | None = Field(default=None, max_length=255)
    date_from: date
    date_to: date
    category_ids: list[int] = Field(default_factory=list)
    years_included: int = Field(default=3, ge=1, le=5)
    report_type: str = Field(default="historical", description=f"One of: {', '.join(REPORT_TYPES)}")
    include_ai_summary: bool = True


class SystemResetRequest(BaseModel):
    superadmin_password: str = Field(min_length=1)
    confirmation_phrase: str = Field(min_length=1)
    wipe_files: bool = False


class SystemResetResponse(BaseModel):
    message: str
    reset_at: datetime


class ReconciliationMonthOut(BaseModel):
    financial_year_id: int
    year: int
    month: int
    month_date: date
    month_label: str
    calculated_balance: Decimal
    reconciled: bool
    reconciliation: ReconciliationOut | None
