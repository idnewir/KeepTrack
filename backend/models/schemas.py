"""Pydantic request/response schemas for the auth API."""
from datetime import date, datetime
from decimal import Decimal
from typing import Generic, TypeVar

from pydantic import BaseModel, EmailStr, Field

from models.report import REPORT_TYPES
from models.user import ROLES

ASSIGNABLE_ROLES = tuple(r for r in ROLES if r != "superadmin")

T = TypeVar("T")


class PaginationMeta(BaseModel):
    page: int
    per_page: int
    total_records: int
    total_pages: int
    has_next: bool
    has_previous: bool


class PaginatedResponse(BaseModel, Generic[T]):
    data: list[T]
    pagination: PaginationMeta


class UserOut(BaseModel):
    id: int
    username: str
    email: str
    display_name: str | None = None
    role: str
    approved: bool
    created_at: datetime
    last_login: datetime | None = None
    is_active: bool = True
    must_change_password: bool = False
    has_seen_welcome: bool = False
    # External avatar URL, straight off the users row. has_avatar/
    # has_signature are computed from avatar_path/signature_path via
    # properties on the User model (see models/user.py) rather than exposing
    # the raw storage paths themselves.
    avatar_url: str | None = None
    has_avatar: bool = False
    # 'upload' or 'gravatar' — lets the profile page decide whether to show
    # "Refresh from Gravatar". avatar_fetched_at is the avatar file's own
    # mtime (see models/user.py), only meaningful when avatar_source is set.
    avatar_source: str | None = None
    avatar_fetched_at: datetime | None = None
    has_signature: bool = False
    # Both computed server-side per-request in GET /auth/me — not columns on
    # User itself. See docs/decisions-log.md.
    session_timeout_minutes: int | None = None
    mfa_remember_active: bool = False

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
    # Only set alongside mfa_required=true — lets the MFA page render "Remember
    # this session for [X] hours" without needing a full access token to call
    # GET /settings. See docs/decisions-log.md.
    mfa_remember_hours: int | None = None


class MFAVerifyRequest(BaseModel):
    temp_token: str
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")
    # Opt-in (default False) — see docs/decisions-log.md.
    remember_session: bool = False


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in_minutes: int
    # Present only when the request had remember_session=true. The raw
    # value is returned exactly once, here — mfa_remember_tokens stores
    # only its SHA-256 hash and cannot reproduce it. See docs/decisions-log.md.
    mfa_remember_token: str | None = None
    mfa_remember_expires_at: datetime | None = None


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


class UserRoleUpdate(BaseModel):
    role: str = Field(description=f"One of: {', '.join(ASSIGNABLE_ROLES)}")


class PasswordResetOut(BaseModel):
    temporary_password: str
    must_change_password: bool = True


class UserDeleteRequest(BaseModel):
    confirmation_phrase: str


class UserDeleteResult(BaseModel):
    message: str


class ForcePasswordChangeRequest(BaseModel):
    new_password: str = Field(min_length=8, max_length=255)


class ProfileUpdateRequest(BaseModel):
    display_name: str | None = Field(default=None, max_length=150)
    email: EmailStr
    # Falsy (omitted/null/empty string) clears it, same convention as
    # display_name above — the frontend always sends the field's current
    # value (blank if unset), so "not present" and "cleared" are the same
    # thing here. Setting a non-empty URL also clears any uploaded
    # avatar_path (see routers/auth.py.update_my_profile) since the two are
    # mutually exclusive. See docs/decisions-log.md.
    avatar_url: str | None = Field(default=None, max_length=1000)


class GravatarFetchRequest(BaseModel):
    email: EmailStr


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=255)


class PasswordChangeOut(BaseModel):
    """A password change invalidates every token issued before the change
    (including the one the request itself used, per the security
    requirement that a password change invalidate existing sessions) — so
    the endpoint hands back a fresh token for the session that just proved
    it knows the new password, alongside the updated user. See
    docs/decisions-log.md."""
    user: UserOut
    access_token: str
    token_type: str = "bearer"
    expires_in_minutes: int


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


_MATCH_TYPE_PATTERN = r"^(exact|contains|starts_with)$"


class TransactionRuleOut(BaseModel):
    id: int
    name: str
    match_type: str
    match_value: str
    category_id: int
    category_name: str
    category_colour: str
    priority: int
    active: bool
    created_by: int | None
    created_at: datetime
    updated_at: datetime


class TransactionRuleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    match_type: str = Field(pattern=_MATCH_TYPE_PATTERN)
    match_value: str = Field(min_length=1, max_length=255)
    category_id: int
    priority: int = 0
    active: bool = True


class TransactionRuleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    match_type: str | None = Field(default=None, pattern=_MATCH_TYPE_PATTERN)
    match_value: str | None = Field(default=None, min_length=1, max_length=255)
    category_id: int | None = None
    priority: int | None = None
    active: bool | None = None


class TransactionRuleSuggestionOut(BaseModel):
    supplier: str
    category_id: int
    category_name: str
    category_colour: str
    occurrence_count: int


class TransactionRuleTestRequest(BaseModel):
    supplier_name: str = Field(min_length=1, max_length=255)


class TransactionRuleTestResult(BaseModel):
    matched: bool
    rule_id: int | None = None
    rule_name: str | None = None
    category_id: int | None = None
    category_name: str | None = None
    category_colour: str | None = None


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
    created_by: int | None = None
    created_at: datetime
    project_id: int | None = None
    project_name: str | None = None
    is_historical: bool = False
    import_batch_id: str | None = None
    import_source: str | None = None

    model_config = {"from_attributes": True}


class InvoiceUpdate(BaseModel):
    invoice_date: date | None = None
    supplier: str | None = Field(default=None, min_length=1, max_length=255)
    amount: Decimal | None = Field(default=None, gt=0)
    category_id: int | None = None
    notes: str | None = None
    # Links the invoice to a planned project. Like category_id above, this
    # only ever *sets* a link via PUT — it can't be used to clear one back to
    # null (None means "leave unchanged", not "clear"), matching this
    # schema's existing convention for every other optional field. Clearing a
    # link is a distinct, confirmation-guarded action — see
    # POST /invoices/{id}/unlink-project. See docs/decisions-log.md.
    project_id: int | None = None


class InvoiceConfirmRequest(BaseModel):
    project_id: int | None = None


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
    value: str = Field(min_length=1, max_length=2000)


class TerminologyOut(BaseModel):
    term_expenses: str
    term_income: str
    term_projects: str
    term_reconciliation: str
    term_reserve: str


class TerminologyUpdate(BaseModel):
    term_expenses: str | None = Field(default=None, min_length=1, max_length=100)
    term_income: str | None = Field(default=None, min_length=1, max_length=100)
    term_projects: str | None = Field(default=None, min_length=1, max_length=100)
    term_reconciliation: str | None = Field(default=None, min_length=1, max_length=100)
    term_reserve: str | None = Field(default=None, min_length=1, max_length=100)


class SetupAppStartDateRequest(BaseModel):
    app_start_date: date | None = None
    financial_year_start_month: int | None = Field(default=None, ge=1, le=12)


class DashboardFinancialYear(BaseModel):
    id: int
    label: str
    start_date: date
    end_date: date
    opening_balance: Decimal | None = None


class DashboardIncomeBreakdownItem(BaseModel):
    group_name: str
    amount: Decimal


class DashboardSpendBreakdownItem(BaseModel):
    category_name: str
    amount: Decimal


class DashboardMonthBreakdown(BaseModel):
    year: int
    month: int
    month_label: str
    actual_spend: Decimal
    actual_income: Decimal
    forecast_spend: Decimal
    planned_project_cost: Decimal
    is_elapsed: bool
    # Cash-flow chart enhancement (V1 Polish) — see docs/decisions-log.md.
    net_cashflow: Decimal
    cumulative_balance: Decimal
    income_breakdown: list[DashboardIncomeBreakdownItem] = []
    spend_breakdown: list[DashboardSpendBreakdownItem] = []


class DashboardMonthlyBreakdownResponse(BaseModel):
    """A single financial year's chart data on its own — lets the dashboard
    fetch the previous FY's breakdown for the 'Last year' chart toggle
    without pulling in the whole /dashboard/summary payload. See
    docs/decisions-log.md."""
    financial_year: DashboardFinancialYear
    monthly_breakdown: list[DashboardMonthBreakdown]


class DashboardPlannedProject(BaseModel):
    id: int
    name: str
    description: str | None
    estimated_cost: Decimal
    expected_month: date
    expected_month_label: str
    actual_cost: Decimal
    invoice_count: int
    variance: Decimal
    variance_percent: Decimal
    project_status: str
    # Only set for a "saving toward this project" funding-target project —
    # see services/project_service.funding_progress.
    is_funding_target: bool = False
    funding_target_amount: Decimal | None = None
    funding_target_date: date | None = None
    monthly_surplus_needed: Decimal | None = None
    on_track: bool | None = None
    current_balance: Decimal | None = None


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


class DashboardDebtPromoExpiring(BaseModel):
    id: int
    name: str
    days_until_promo_ends: int
    promotional_end_date: date
    standard_rate_after_promo: Decimal | None


class DashboardHighestInterestDebt(BaseModel):
    id: int
    name: str
    interest_rate: Decimal


class DashboardDebtSummaryItem(BaseModel):
    id: int
    name: str
    current_balance: Decimal
    interest_rate: Decimal
    next_payment_date: date
    promotional_end_date: date | None = None


class DashboardBudgetCategoryStatus(BaseModel):
    category_id: int
    category_name: str
    category_colour: str
    ytd_budget: Decimal
    ytd_actual: Decimal
    percent_used: Decimal


class DashboardBudgetSummary(BaseModel):
    total_budgeted_ytd: Decimal
    total_actual_ytd: Decimal
    total_variance_ytd: Decimal
    categories_over_budget: list[DashboardBudgetCategoryStatus]
    categories_warning: list[DashboardBudgetCategoryStatus]
    overall_status: str  # "on_track" | "warning" | "over_budget"


class DashboardSavingsGoal(BaseModel):
    id: int
    name: str
    target_amount: Decimal
    target_date: date
    current_amount: Decimal
    percent_complete: Decimal
    months_remaining: int
    monthly_needed: Decimal
    on_track: bool


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

    # Present only when the debt_tracking module is enabled (routers/dashboard.py) —
    # left at their defaults (None/empty) otherwise, the same "always on the
    # schema, module state decides whether it's populated" approach already
    # used for planned_projects. See docs/decisions-log.md.
    total_debt: Decimal | None = None
    monthly_debt_payments: Decimal | None = None
    debts_with_promo_expiring: list[DashboardDebtPromoExpiring] = Field(default_factory=list)
    highest_interest_debt: DashboardHighestInterestDebt | None = None
    net_worth: Decimal | None = None
    debts_summary: list[DashboardDebtSummaryItem] = Field(default_factory=list)

    # Present only when the budget_planning module is enabled
    # (routers/dashboard.py) — same "always on the schema, module state
    # decides whether it's populated" approach as the debt fields above.
    # See docs/decisions-log.md.
    budget_summary: DashboardBudgetSummary | None = None
    savings_goals: list[DashboardSavingsGoal] = Field(default_factory=list)


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
    recorded_by: int | None = None
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
    reconciled_by: int | None = None
    reconciled_by_username: str | None
    reconciled_at: datetime
    edited_by: int | None = None
    edited_by_username: str | None = None
    edited_at: datetime | None = None
    edit_reason: str | None = None
    is_stale: bool = False
    stale_reason: str | None = None
    stale_since: datetime | None = None
    # For a stale reconciliation, current_* is recalculated live against
    # today's contributions/invoices while original_* is what was stored at
    # submission time; for a non-stale one they're identical to
    # calculated_balance/discrepancy. See docs/decisions-log.md.
    original_calculated_balance: Decimal
    current_calculated_balance: Decimal
    original_discrepancy: Decimal
    current_discrepancy: Decimal


class ProjectLinkedInvoiceOut(BaseModel):
    id: int
    invoice_date: date
    supplier: str
    amount: Decimal
    category_id: int | None
    category_name: str | None
    category_colour: str | None


class ProjectOut(BaseModel):
    id: int
    name: str
    description: str | None
    estimated_cost: Decimal
    expected_month: date
    financial_year_id: int | None
    created_by: int | None = None
    created_at: datetime
    active: bool
    completed: bool
    completed_at: datetime | None = None
    edited_by: int | None = None
    edited_at: datetime | None = None
    edit_reason: str | None = None
    admin_edit_notes: str | None = None
    # Computed live from linked confirmed invoices — never stored, so these
    # can't drift from the underlying invoice data. See
    # services/project_service.py and docs/decisions-log.md.
    actual_cost: Decimal
    invoice_count: int
    variance: Decimal
    variance_percent: Decimal
    project_status: str
    linked_invoices: list[ProjectLinkedInvoiceOut] = Field(default_factory=list)
    # "I am saving toward this project" mode — a savings goal tracked
    # against the app's overall current balance rather than this project's
    # own actual/estimated spend. is_funding_target/funding_target_amount/
    # funding_target_date/funding_notes are stored columns; the rest are
    # computed live (never stored) by services/project_service.funding_progress
    # the same "compute, don't cache" reasoning as actual_cost/project_status
    # above — and are None/absent unless is_funding_target is set. See
    # docs/decisions-log.md.
    is_funding_target: bool = False
    funding_target_amount: Decimal | None = None
    funding_target_date: date | None = None
    funding_notes: str | None = None
    current_balance: Decimal | None = None
    monthly_surplus_needed: Decimal | None = None
    current_monthly_surplus: Decimal | None = None
    on_track: bool | None = None
    projected_completion: date | None = None

    model_config = {"from_attributes": True}


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    estimated_cost: Decimal = Field(gt=0)
    expected_month: date
    financial_year_id: int | None = None
    is_funding_target: bool = False
    funding_target_amount: Decimal | None = Field(default=None, gt=0)
    funding_target_date: date | None = None
    funding_notes: str | None = Field(default=None, max_length=1000)


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
    is_funding_target: bool | None = None
    funding_target_amount: Decimal | None = Field(default=None, gt=0)
    funding_target_date: date | None = None
    funding_notes: str | None = Field(default=None, max_length=1000)


class ReportOut(BaseModel):
    id: int
    title: str
    generated_by: int | None = None
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
    # Only has an effect when the budget_planning module is enabled — a
    # report built while it's disabled silently ignores this rather than
    # erroring, same as every other module-gated field in this app.
    include_budget: bool = False


class SystemResetRequest(BaseModel):
    superadmin_password: str = Field(min_length=1)
    confirmation_phrase: str = Field(min_length=1)
    wipe_files: bool = False


class SystemResetResponse(BaseModel):
    message: str
    reset_at: datetime


class AuditLogOut(BaseModel):
    id: int
    user_id: int | None
    user_display_name: str | None
    action_type: str
    description: str
    affected_table: str | None
    affected_record_id: int | None
    metadata: dict | None = None
    ip_address: str | None
    created_at: datetime


class ErrorLogOut(BaseModel):
    id: int
    severity: str
    source: str
    message: str
    stack_trace: str | None
    request_path: str | None
    user_id: int | None
    user_display_name: str | None
    created_at: datetime
    resolved: bool
    resolved_by: int | None
    resolved_by_display_name: str | None
    resolved_at: datetime | None
    resolved_note: str | None


class ErrorResolveRequest(BaseModel):
    resolved_note: str | None = Field(default=None, max_length=500)


class ErrorClearAllRequest(BaseModel):
    confirmation_phrase: str


class ErrorClearSelectedRequest(BaseModel):
    ids: list[int] = Field(min_length=1)


class ErrorLogClearResult(BaseModel):
    deleted_count: int


class LogsStatusOut(BaseModel):
    audit_log_count: int
    audit_log_archive_count: int
    error_log_count: int
    last_archive_run: datetime | None
    next_archive_run: datetime | None
    last_error_cleanup_run: datetime | None
    next_error_cleanup_run: datetime | None


class ArchiveNowOut(LogsStatusOut):
    archived_count: int


class ReconciliationMonthOut(BaseModel):
    financial_year_id: int
    year: int
    month: int
    month_date: date
    month_label: str
    calculated_balance: Decimal
    reconciled: bool
    reconciliation: ReconciliationOut | None


class StorageBreakdownItem(BaseModel):
    label: str
    file_count: int
    size_bytes: int
    size_human: str


class StorageStatusOut(BaseModel):
    storage_path: str
    total_files: int
    total_size_bytes: int
    total_size_human: str
    breakdown: list[StorageBreakdownItem]
    backup_path: str | None
    backup_schedule: str
    backup_retention_count: int
    last_backup_date: datetime | None
    last_backup_size_human: str | None
    next_scheduled_backup: datetime | None


class StoragePathChangeRequest(BaseModel):
    new_path: str = Field(min_length=1, max_length=500)
    move_files: bool = True


class StoragePathChangeResponse(BaseModel):
    storage_path: str
    files_moved: int
    bytes_moved: int
    message: str


class BackupOut(BaseModel):
    filename: str
    backup_type: str
    created_at: datetime
    size_bytes: int
    size_human: str


class BackupScheduleRequest(BaseModel):
    backup_schedule: str = Field(description="One of: manual, daily, weekly, monthly")
    backup_path: str | None = Field(default=None, max_length=500)
    backup_retention_count: int = Field(default=5, ge=1, le=100)


class BackupScheduleOut(BaseModel):
    backup_schedule: str
    backup_path: str | None
    backup_retention_count: int
    next_scheduled_backup: datetime | None


class ScheduledBackupRunOut(BaseModel):
    success: bool
    file_path: str
    file_size_bytes: int
    file_size_human: str
    duration_seconds: float


class BackupManifestPreview(BaseModel):
    backup_type: str
    created_at: datetime
    keep_track_version: str
    record_counts: dict
    files_included_count: int
    secrets_to_copy_manually: list[str]
    superadmin_warning: str | None = None


class RestoreResultOut(BaseModel):
    message: str
    record_counts: dict
    backup_created_at: datetime | None
    superadmin_warning: str | None = None


class AIConfigOut(BaseModel):
    provider: str
    model: str | None
    endpoint_url: str | None
    ai_enabled: bool
    api_key_set: bool
    api_key_source: str  # "database" | "environment" | "none"


class AIConfigUpdate(BaseModel):
    provider: str
    model: str | None = Field(default=None, max_length=255)
    api_key: str | None = Field(default=None, max_length=1000)
    endpoint_url: str | None = Field(default=None, max_length=500)
    ai_enabled: bool = True


class AITestResultOut(BaseModel):
    model_config = {"protected_namespaces": ()}

    success: bool
    response_time_ms: int | None
    model_used: str | None
    error: str | None


class AIProviderModelsOut(BaseModel):
    models: list[str]
    note: str | None = None


class AIStatusOut(BaseModel):
    """Minimal, non-admin-safe view of AI availability — just enough for the
    invoice review card to decide which banner (if any) to show. Deliberately
    carries no provider/model/endpoint detail, unlike GET /ai/config."""
    enabled: bool
    configured: bool


class CSVPreviewOut(BaseModel):
    headers: list[str]
    rows: list[list[str]]
    column_map: dict[str, int]


class ImportBatchOut(BaseModel):
    id: int
    batch_id: str
    import_type: str
    filename: str | None
    total_records: int
    imported_records: int
    failed_records: int
    status: str
    imported_by: int | None = None
    imported_by_username: str | None = None
    imported_at: datetime
    notes: str | None

    model_config = {"from_attributes": True}


class ImportRowIssue(BaseModel):
    row: int
    reason: str


class CSVImportResultOut(BaseModel):
    batch: ImportBatchOut
    total_rows: int
    imported: int
    skipped: list[ImportRowIssue]
    duplicates_flagged: list[ImportRowIssue]


class ImportBatchDetailOut(BaseModel):
    batch: ImportBatchOut
    invoices: list[InvoiceOut]


class ImportBatchDeleteResult(BaseModel):
    batch_id: str
    dry_run: bool
    deleted_count: int
    protected_count: int


class SearchInvoiceResult(BaseModel):
    id: int
    invoice_date: date
    supplier: str
    amount: Decimal
    category_name: str | None = None
    category_colour: str | None = None
    reviewed: bool
    signed: bool
    is_historical: bool
    project_name: str | None = None
    # "Field: ...matched text..." — see services/search_service.py. None
    # only if a row somehow matched with nothing to show a snippet for.
    snippet: str | None = None
    relevance: float


class SearchContributionResult(BaseModel):
    id: int
    financial_year_id: int
    month: int
    group_name: str
    amount: Decimal
    snippet: str | None = None


class SearchProjectResult(BaseModel):
    id: int
    name: str
    description: str | None = None
    estimated_cost: Decimal
    status: str | None = None
    snippet: str | None = None


class SearchInvoicesSection(BaseModel):
    total: int
    results: list[SearchInvoiceResult]
    # Only the invoices section is paginated on the full results page —
    # contributions/projects are capped, unpaginated top-matches lists. See
    # docs/decisions-log.md.
    pagination: PaginationMeta


class SearchContributionsSection(BaseModel):
    total: int
    results: list[SearchContributionResult]


class SearchProjectsSection(BaseModel):
    total: int
    results: list[SearchProjectResult]


class SearchResponse(BaseModel):
    invoices: SearchInvoicesSection
    contributions: SearchContributionsSection
    projects: SearchProjectsSection
    query: str
    total: int


class NotificationOut(BaseModel):
    id: int
    type: str
    title: str
    message: str
    link: str | None
    severity: str
    read: bool
    dismissed: bool
    created_at: datetime
    expires_at: datetime | None

    model_config = {"from_attributes": True}


class NotificationListOut(BaseModel):
    notifications: list[NotificationOut]
    unread_count: int


class NotificationCountOut(BaseModel):
    unread_count: int
    # Present on GET /notifications/count (absent — defaults to {} — on the
    # read/dismiss-all endpoints that reuse this same response model, which
    # have no reason to recompute module state). The frontend's ModulesContext
    # polls this endpoint every 30s specifically to pick this up. See
    # docs/decisions-log.md.
    modules: dict[str, bool] = Field(default_factory=dict)


class FeatureModuleOut(BaseModel):
    id: int
    module_key: str
    enabled: bool
    label: str
    description: str
    default_enabled: bool
    requires_setup: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class HelpGuideOut(BaseModel):
    key: str
    title: str
    filename: str


class FeatureModuleUpdate(BaseModel):
    enabled: bool


class FeatureModuleLabelUpdate(BaseModel):
    # Debt Tracking / Budget Planning's setup prompt lets an Admin rename the
    # module ("What would you like to call this module?") — the only field
    # that prompt writes back, so it gets its own narrow schema rather than
    # reusing FeatureModuleUpdate.
    label: str = Field(min_length=1, max_length=100)


# ---------------------------------------------------------------------------
# Folder Integration (backend/routers/folder.py)
# ---------------------------------------------------------------------------

class FolderSideConfigOut(BaseModel):
    """One side (input or output) of GET /folder/config — never carries the
    SMB password itself, only whether one is set, same pattern as
    AIConfigOut.api_key_set."""
    enabled: bool
    type: str  # "local" | "smb"
    path: str | None
    smb_server: str | None
    smb_share: str | None
    smb_username: str | None
    smb_password_set: bool
    smb_guest: bool


class FolderConfigOut(BaseModel):
    input: FolderSideConfigOut
    output: FolderSideConfigOut
    poll_interval: int
    output_behaviour: str


class FolderInputConfigUpdate(BaseModel):
    enabled: bool = False
    type: str = Field(default="local", pattern="^(local|smb)$")
    path: str | None = Field(default=None, max_length=500)
    smb_server: str | None = Field(default=None, max_length=255)
    smb_share: str | None = Field(default=None, max_length=255)
    smb_username: str | None = Field(default=None, max_length=255)
    # None/omitted = leave the stored password unchanged; "" clears it.
    smb_password: str | None = Field(default=None, max_length=500)
    smb_guest: bool = False
    poll_interval: int = 60


class FolderOutputConfigUpdate(BaseModel):
    enabled: bool = False
    type: str = Field(default="local", pattern="^(local|smb)$")
    path: str | None = Field(default=None, max_length=500)
    smb_server: str | None = Field(default=None, max_length=255)
    smb_share: str | None = Field(default=None, max_length=255)
    smb_username: str | None = Field(default=None, max_length=255)
    smb_password: str | None = Field(default=None, max_length=500)
    smb_guest: bool = False
    behaviour: str = Field(default="both", pattern="^(browser_only|folder_only|both)$")


class FolderTestResultOut(BaseModel):
    success: bool
    file_count: int | None = None
    error: str | None = None


class FolderWatcherLogOut(BaseModel):
    id: int
    event_type: str
    filename: str
    status: str
    message: str | None
    invoice_id: int | None
    created_at: datetime

    model_config = {"from_attributes": True}


class FolderSideStatusOut(BaseModel):
    enabled: bool
    type: str
    configured: bool


class FolderInputStatusOut(FolderSideStatusOut):
    last_poll: datetime | None
    next_poll: datetime | None
    files_processed_today: int


class FolderOutputStatusOut(FolderSideStatusOut):
    files_written_today: int


class FolderStatusOut(BaseModel):
    input: FolderInputStatusOut
    output: FolderOutputStatusOut
    recent_log: list[FolderWatcherLogOut]


class FolderOverrideDuplicateRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=255)


class FolderOutputWriteResultOut(BaseModel):
    """POST /invoices/{id}/export-to-folder's response — the same shape
    services/folder_watcher_service.write_to_output_folder returns
    internally."""
    written: bool
    path: str | None
    error: str | None


class InvoiceSignResponseOut(BaseModel):
    """POST /invoices/{id}/sign's response. `download` tells the frontend
    whether it should follow up with GET /invoices/{id}/signed-pdf and
    trigger a browser download — false only when the output folder is
    enabled and set to 'folder_only', per folder_output_behaviour. See
    docs/decisions-log.md for why this is a typed field rather than the
    frontend re-deriving it from settings itself."""
    invoice: InvoiceOut
    download: bool
    output_write: FolderOutputWriteResultOut


# ---------------------------------------------------------------------------
# Debt Tracking (backend/routers/debts.py)
# ---------------------------------------------------------------------------

class DebtPaymentOut(BaseModel):
    id: int
    debt_id: int
    amount: Decimal
    payment_date: date
    notes: str | None
    recorded_by: int | None = None
    recorded_by_username: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class DebtPaymentCreate(BaseModel):
    amount: Decimal = Field(gt=0)
    payment_date: date
    notes: str | None = Field(default=None, max_length=500)


class DebtMilestoneOut(BaseModel):
    milestone_percent: int
    notified_at: datetime

    model_config = {"from_attributes": True}


class DebtCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    debt_type: str
    custom_type_label: str | None = Field(default=None, max_length=100)
    current_balance: Decimal = Field(ge=0)
    credit_limit: Decimal | None = Field(default=None, ge=0)
    monthly_payment: Decimal = Field(gt=0)
    payment_due_day: int = Field(ge=1, le=31)
    start_date: date
    expected_end_date: date | None = None
    interest_rate: Decimal = Field(ge=0)
    rate_type: str = "standard"
    promotional_end_date: date | None = None
    standard_rate_after_promo: Decimal | None = Field(default=None, ge=0)
    notes: str | None = None


class DebtUpdate(BaseModel):
    # None means "leave unchanged" on every field here — same convention as
    # InvoiceUpdate/ProjectUpdate. See their docstrings for precedent.
    name: str | None = Field(default=None, min_length=1, max_length=255)
    debt_type: str | None = None
    custom_type_label: str | None = None
    current_balance: Decimal | None = Field(default=None, ge=0)
    credit_limit: Decimal | None = Field(default=None, ge=0)
    monthly_payment: Decimal | None = Field(default=None, gt=0)
    payment_due_day: int | None = Field(default=None, ge=1, le=31)
    start_date: date | None = None
    expected_end_date: date | None = None
    interest_rate: Decimal | None = Field(default=None, ge=0)
    rate_type: str | None = None
    promotional_end_date: date | None = None
    standard_rate_after_promo: Decimal | None = None
    notes: str | None = None


class DebtOut(BaseModel):
    id: int
    name: str
    debt_type: str
    custom_type_label: str | None
    current_balance: Decimal
    original_balance: Decimal
    credit_limit: Decimal | None
    monthly_payment: Decimal
    payment_due_day: int
    start_date: date
    expected_end_date: date | None
    interest_rate: Decimal
    rate_type: str
    promotional_end_date: date | None
    standard_rate_after_promo: Decimal | None
    notes: str | None
    is_paid_off: bool
    paid_off_date: date | None
    created_by: int | None = None
    created_at: datetime
    updated_at: datetime
    active: bool

    # Computed live by services/debt_service.py — never stored, so these can
    # never drift from the debt's actual current_balance/interest_rate.
    percent_paid: Decimal
    months_remaining: int | None = None
    total_interest_remaining: Decimal | None = None
    total_to_pay: Decimal | None = None
    payment_below_interest: bool = False
    days_until_promo_ends: int | None = None
    promo_expiring_soon: bool = False
    next_payment_date: date
    recent_payments: list[DebtPaymentOut] = Field(default_factory=list)


class DebtDetailOut(DebtOut):
    payments: list[DebtPaymentOut] = Field(default_factory=list)
    milestones: list[DebtMilestoneOut] = Field(default_factory=list)
    # services/debt_calculator.py's raw output — a single-scenario dict for a
    # standard-rate debt, or {"current": {...}, "standard": {...}} for a
    # promotional/0% debt. Left untyped since the two shapes genuinely
    # differ and the frontend only ever consumes it as-is, never re-validates
    # it. See docs/decisions-log.md.
    payoff: dict


class DebtTerminologyOut(BaseModel):
    debt_term_module: str
    debt_term_debt: str
    debt_term_payment: str


class DebtTerminologyUpdate(BaseModel):
    debt_term_module: str | None = Field(default=None, min_length=1, max_length=100)
    debt_term_debt: str | None = Field(default=None, min_length=1, max_length=100)
    debt_term_payment: str | None = Field(default=None, min_length=1, max_length=100)


# ---------------------------------------------------------------------------
# Budget Planning (backend/routers/budgets.py, backend/routers/savings_goals.py)
# ---------------------------------------------------------------------------

class CategoryBudgetOut(BaseModel):
    id: int
    category_id: int
    category_name: str
    category_colour: str
    financial_year_id: int
    annual_amount: Decimal
    # Raw per-month overrides as stored ({"12": 600, ...}) — present so the
    # Admin edit panel can pre-fill only the months actually overridden,
    # distinct from monthly_budget below (every month, override or fallback).
    monthly_amounts: dict[str, Decimal] | None = None

    # Computed live by services/budget_service.py from confirmed invoices —
    # never stored, so these can never drift from the underlying invoice
    # data. Keyed "1".."12" (calendar month number as a string, since JSON
    # object keys are always strings).
    monthly_budget: dict[str, Decimal]
    actual_spend_by_month: dict[str, Decimal]
    variance_by_month: dict[str, Decimal]
    ytd_budget: Decimal
    ytd_actual: Decimal
    ytd_variance: Decimal
    status: str  # "under_budget" | "warning" | "over_budget"
    percent_used: Decimal

    created_by: int | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UnbudgetedCategoryOut(BaseModel):
    category_id: int
    category_name: str
    category_colour: str
    actual_spend_ytd: Decimal


class BudgetsListOut(BaseModel):
    financial_year_id: int
    financial_year_label: str
    budgets: list[CategoryBudgetOut]
    unbudgeted_categories: list[UnbudgetedCategoryOut]


class CategoryBudgetCreate(BaseModel):
    category_id: int
    financial_year_id: int | None = None
    annual_amount: Decimal = Field(gt=0)
    monthly_amounts: dict[str, Decimal] | None = None


class BudgetSummaryCategoryOut(BaseModel):
    category_id: int
    category_name: str
    category_colour: str
    ytd_budget: Decimal
    ytd_actual: Decimal
    percent_used: Decimal


class BudgetSummaryOut(BaseModel):
    financial_year_id: int
    total_budgeted_ytd: Decimal
    total_actual_ytd: Decimal
    total_variance_ytd: Decimal
    categories_over_budget: list[BudgetSummaryCategoryOut]
    categories_warning: list[BudgetSummaryCategoryOut]
    overall_status: str  # "on_track" | "warning" | "over_budget"


class BudgetTerminologyOut(BaseModel):
    budget_term_module: str
    budget_term_budget: str
    budget_term_savings_goal: str


class BudgetTerminologyUpdate(BaseModel):
    budget_term_module: str | None = Field(default=None, min_length=1, max_length=100)
    budget_term_budget: str | None = Field(default=None, min_length=1, max_length=100)
    budget_term_savings_goal: str | None = Field(default=None, min_length=1, max_length=100)


class SavingsGoalOut(BaseModel):
    id: int
    name: str
    description: str | None
    target_amount: Decimal
    target_date: date
    current_amount: Decimal
    category_id: int | None
    category_name: str | None = None
    financial_year_id: int | None
    status: str
    created_by: int | None = None
    created_at: datetime
    updated_at: datetime

    # Computed live by services/budget_service.py — never stored, so these
    # can never drift from current_amount/target_amount/target_date.
    percent_complete: Decimal
    months_remaining: int
    monthly_needed: Decimal
    on_track: bool

    model_config = {"from_attributes": True}


class SavingsGoalCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    target_amount: Decimal = Field(gt=0)
    target_date: date
    category_id: int | None = None
    financial_year_id: int | None = None


class SavingsGoalUpdate(BaseModel):
    # None means "leave unchanged" on every field here — same convention as
    # DebtUpdate/ProjectUpdate.
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    target_amount: Decimal | None = Field(default=None, gt=0)
    target_date: date | None = None
    category_id: int | None = None
    financial_year_id: int | None = None
    status: str | None = None


class SavingsGoalContribute(BaseModel):
    amount: Decimal = Field(gt=0)
    notes: str | None = Field(default=None, max_length=500)
