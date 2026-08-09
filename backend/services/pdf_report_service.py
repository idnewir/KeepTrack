"""PDF report generation via ReportLab, with charts rendered through matplotlib.

Builds the full multi-section PDF a generated report becomes: a branded
cover page, an AI-written summary with metric cards, overview metrics,
current-year and year-on-year charts, an optional forecast section, an
optional budget vs. actual table (when include_budget was requested and the
budget_planning module has data for it), a funding position table, and a
blank context-notes section left for manual annotation afterwards.

Charts are rendered with matplotlib (not ReportLab's native chart graphics)
so their fonts can be pinned to match the ReportLab body text exactly — see
the matplotlib.rcParams block below and docs/decisions-log.md for why.

No build_khoc_report.py exists anywhere in this repo to copy structure or
chart styling from (checked both the repo root and the whole tree) — the
layout below was built directly from docs/features.md#6 and this task's own
brief instead. See docs/decisions-log.md.
"""
from datetime import datetime
from decimal import Decimal
from io import BytesIO

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Patch
from matplotlib.ticker import FuncFormatter

from reportlab.graphics.shapes import Circle, Drawing, Path, Rect, String
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import (
    Flowable,
    Image,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus.flowables import HRFlowable

from utils.pdf_text import pdf_text

# Chart fonts are pinned to match the ReportLab body text (Helvetica) as
# closely as matplotlib allows, so charts and prose read as one document
# instead of two different tools bolted together — must be set before any
# figure is created.
matplotlib.rcParams["font.family"] = "sans-serif"
matplotlib.rcParams["font.sans-serif"] = ["Helvetica", "Arial", "DejaVu Sans"]
matplotlib.rcParams["font.size"] = 8

PRIMARY_HEX = "#2D6B9F"
ACCENT_HEX = "#1D9E75"
AMBER_HEX = "#EF9F27"
RED_HEX = "#E74C3C"
TEXT_DARK_HEX = "#2C2C2A"
MUTED_HEX = "#5F5E5A"
NAVY_HEX = "#1a2744"
RULE_GREY_HEX = "#D3D1C7"
CARD_BG_HEX = "#F1EFE8"
INSIGHT_BG_HEX = "#E6F1FB"

PRIMARY = colors.HexColor(PRIMARY_HEX)
ACCENT = colors.HexColor(ACCENT_HEX)
AMBER = colors.HexColor(AMBER_HEX)
RED = colors.HexColor(RED_HEX)
TEXT_DARK = colors.HexColor(TEXT_DARK_HEX)
MUTED = colors.HexColor(MUTED_HEX)
NAVY = colors.HexColor(NAVY_HEX)
RULE_GREY = colors.HexColor(RULE_GREY_HEX)
CARD_BG = colors.HexColor(CARD_BG_HEX)
INSIGHT_BG = colors.HexColor(INSIGHT_BG_HEX)

# Used when a category's own colour can't be resolved (e.g. "Uncategorised",
# which has none) — cycles through the brand palette plus a couple of extra
# hues so charts with more categories than brand colours still stay legible.
CATEGORY_FALLBACK_HEX = [PRIMARY_HEX, ACCENT_HEX, AMBER_HEX, "#7C5CBF", "#A83232", "#3C9DBF"]

REPORT_TYPE_LABELS = {
    "historical": "Historical Analysis",
    "forecast": "Forecast Report",
    "combined": "Financial Report",
}

# 27mm margins per the brand's print spec — content area is then the A4
# width minus 54mm (~157mm), computed below rather than hardcoded so every
# table/chart width follows automatically if this ever changes.
PAGE_MARGIN = 2.7 * cm
CONTENT_WIDTH = A4[0] - 2 * PAGE_MARGIN


def _money(amount) -> str:
    return f"£{Decimal(amount or 0):,.2f}"


def _hex_for(hex_value: str | None, index: int) -> str:
    if hex_value:
        try:
            colors.HexColor(hex_value)
            return hex_value
        except ValueError:
            pass
    return CATEGORY_FALLBACK_HEX[index % len(CATEGORY_FALLBACK_HEX)]


def _cols(*fractions: float) -> list:
    return [CONTENT_WIDTH * f for f in fractions]


def _elapsed_months(data: dict) -> int:
    return max(
        1,
        sum(1 for row in data["monthly_totals"] if (row["year"], row["month"]) <= (data["date_to"].year, data["date_to"].month)),
    )


def _build_styles():
    base = getSampleStyleSheet()
    return {
        "body": ParagraphStyle(
            "body", parent=base["Normal"], fontSize=10, leading=15, textColor=MUTED, spaceAfter=8,
        ),
        "muted": ParagraphStyle(
            "muted", parent=base["Normal"], fontSize=9, leading=13, textColor=MUTED,
        ),
        "insight": ParagraphStyle(
            "insight", parent=base["Normal"], fontSize=10, leading=15, textColor=TEXT_DARK,
            leftIndent=14, spaceAfter=6, bulletIndent=2,
        ),
        "table_header": ParagraphStyle(
            "table_header", parent=base["Normal"], fontSize=9, leading=12,
            textColor=colors.white, fontName="Helvetica-Bold",
        ),
        "table_cell": ParagraphStyle(
            "table_cell", parent=base["Normal"], fontSize=9.5, leading=13, textColor=TEXT_DARK,
        ),
    }


def _status_style(base_style: ParagraphStyle, colour) -> ParagraphStyle:
    return ParagraphStyle(f"status_{colour}", parent=base_style, textColor=colour, fontName="Helvetica-Bold")


# ---------------------------------------------------------------------------
# Section headings — small caps (approximated with uppercase text, since
# ReportLab has no true small-caps rendering), letter-spaced via the PDF
# character-spacing operator, with an optional full-width rule below. Text
# is never auto-uppercased by this class: some headings embed a financial
# year label (e.g. "Sep–Aug") whose case must be preserved, so callers pass
# already-cased text.
# ---------------------------------------------------------------------------
class _SectionHeading(Flowable):
    def __init__(self, text: str, colour=MUTED, rule: bool = True, size: float = 9):
        super().__init__()
        self.text = text
        self.width = CONTENT_WIDTH
        self.colour = colour
        self.rule = rule
        self.size = size
        self.char_space = size * 0.1
        self.spaceBefore = 18 if rule else 12
        self.spaceAfter = 8 if rule else 4
        self.height = size + 11 if rule else size + 3

    def wrap(self, availWidth, availHeight):
        return self.width, self.height

    def draw(self):
        c = self.canv
        c.saveState()
        # Character spacing is only exposed on a PDFTextObject, not on the
        # plain Canvas, so the letter-spaced heading text has to go through
        # beginText()/drawText() rather than the usual drawString().
        baseline = self.height - self.size if self.rule else 2
        text_obj = c.beginText(0, baseline)
        text_obj.setFont("Helvetica-Bold", self.size)
        text_obj.setFillColor(self.colour)
        text_obj.setCharSpace(self.char_space)
        text_obj.textOut(self.text)
        c.drawText(text_obj)
        if self.rule:
            c.setStrokeColor(RULE_GREY)
            c.setLineWidth(0.75)
            c.line(0, 0, self.width, 0)
        c.restoreState()


def _sub_heading(text: str) -> _SectionHeading:
    return _SectionHeading(text, colour=PRIMARY, rule=False, size=9)


# ---------------------------------------------------------------------------
# Logo — redrawn from frontend/src/components/Logo.jsx's inline SVG (3
# ascending bars + a green tick badge) using ReportLab shapes rather than
# embedding a raster image, so it stays crisp at any size and needs no
# asset file. SVG viewBox is 0 0 48 48 with a top-left origin; ReportLab's
# origin is bottom-left, so every y coordinate below is flipped (48 - y).
# ---------------------------------------------------------------------------
def _logo_drawing(size: float = 42) -> Drawing:
    s = size / 48.0
    d = Drawing(size, size)
    for x, y_svg, w, h in ((6, 24, 7, 16), (17, 16, 7, 24), (28, 8, 7, 32)):
        y = 48 - y_svg - h
        d.add(Rect(x * s, y * s, w * s, h * s, rx=1.5 * s, ry=1.5 * s, fillColor=PRIMARY, strokeColor=None))
    d.add(Circle(37 * s, (48 - 11) * s, 10 * s, fillColor=ACCENT, strokeColor=None))
    tick = Path(strokeColor=colors.white, strokeWidth=2.2 * s, fillColor=None, strokeLineCap=1, strokeLineJoin=1)
    (x0, y0), (x1, y1), (x2, y2) = ((32.5, 48 - 11.2), (35.5, 48 - 14.2), (41.5, 48 - 7.8))
    tick.moveTo(x0 * s, y0 * s)
    tick.lineTo(x1 * s, y1 * s)
    tick.lineTo(x2 * s, y2 * s)
    d.add(tick)
    return d


def _draw_cover_page(canvas: Canvas, doc, *, site_name: str, report_type_label: str, date_from, date_to,
                      generated_by: str, generated_at: datetime) -> None:
    canvas.saveState()
    width, height = A4
    margin = PAGE_MARGIN
    center_x = width / 2

    logo_size = 42
    wordmark_size = 26
    canvas.setFont("Helvetica-Bold", wordmark_size)
    keep_w = canvas.stringWidth("Keep ", "Helvetica-Bold", wordmark_size)
    track_w = canvas.stringWidth("Track", "Helvetica-Bold", wordmark_size)
    gap = 10
    block_w = logo_size + gap + keep_w + track_w
    start_x = center_x - block_w / 2
    logo_y = height - margin - 3.2 * cm - logo_size

    _logo_drawing(logo_size).drawOn(canvas, start_x, logo_y)

    text_x = start_x + logo_size + gap
    text_baseline_y = logo_y + logo_size / 2 - wordmark_size * 0.33
    canvas.setFillColor(PRIMARY)
    canvas.drawString(text_x, text_baseline_y, "Keep ")
    canvas.setFillColor(TEXT_DARK)
    canvas.drawString(text_x + keep_w, text_baseline_y, "Track")

    rule_y1 = logo_y - 1.4 * cm
    canvas.setStrokeColor(PRIMARY)
    canvas.setLineWidth(3)
    canvas.line(margin, rule_y1, width - margin, rule_y1)

    org_y = rule_y1 - 2.2 * cm
    canvas.setFont("Helvetica-Bold", 24)
    canvas.setFillColor(TEXT_DARK)
    canvas.drawCentredString(center_x, org_y, pdf_text(site_name))

    type_y = org_y - 1.0 * cm
    canvas.setFont("Helvetica", 13)
    canvas.setFillColor(MUTED)
    canvas.drawCentredString(center_x, type_y, report_type_label)

    rule_y2 = type_y - 1.2 * cm
    canvas.setStrokeColor(PRIMARY)
    canvas.setLineWidth(3)
    canvas.line(margin, rule_y2, width - margin, rule_y2)

    date_y = rule_y2 - 1.4 * cm
    canvas.setFont("Helvetica", 12)
    canvas.setFillColor(MUTED)
    canvas.drawCentredString(center_x, date_y, f"{date_from:%d %B %Y} — {date_to:%d %B %Y}")

    canvas.setFont("Helvetica", 8.5)
    canvas.setFillColor(MUTED)
    canvas.drawRightString(
        width - margin, margin * 0.55,
        f"Generated by {pdf_text(generated_by)} on {generated_at:%d %B %Y}",
    )
    canvas.restoreState()


# ---------------------------------------------------------------------------
# Summary page — metric cards, AI narrative, key insights box.
# ---------------------------------------------------------------------------
def _metric_card(label: str, value_text: str, value_colour, card_width: float, card_height: float = 68) -> Drawing:
    d = Drawing(card_width, card_height)
    d.add(Rect(0, 0, card_width, card_height, rx=8, ry=8, fillColor=CARD_BG, strokeColor=None))
    d.add(String(14, card_height - 22, label.upper(), fontName="Helvetica-Bold", fontSize=8, fillColor=MUTED))
    d.add(String(14, 16, value_text, fontName="Helvetica-Bold", fontSize=19, fillColor=value_colour))
    return d


def _metric_cards(data: dict) -> Table:
    gap = 0.4 * cm
    card_w = (CONTENT_WIDTH - 2 * gap) / 3
    net = data["net_position"]
    net_colour = ACCENT if net >= 0 else RED
    cards = [
        _metric_card("Total spend", _money(data["total_spend"]), RED, card_w),
        _metric_card("Total income", _money(data["total_income"]), ACCENT, card_w),
        _metric_card("Net position", _money(net), net_colour, card_w),
    ]
    table = Table([cards], colWidths=[card_w + gap, card_w + gap, card_w], hAlign="LEFT")
    table.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return table


def _insight_box(styles, insights: list) -> Table:
    rows = [[Paragraph(f"• {pdf_text(i)}", styles["insight"])] for i in insights]
    table = Table(rows, colWidths=[CONTENT_WIDTH])
    n = len(rows)
    style = [
        ("BACKGROUND", (0, 0), (-1, -1), INSIGHT_BG),
        ("LEFTPADDING", (0, 0), (-1, -1), 14),
        ("RIGHTPADDING", (0, 0), (-1, -1), 14),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("TOPPADDING", (0, 0), (-1, 0), 12),
        ("BOTTOMPADDING", (0, n - 1), (-1, n - 1), 12),
    ]
    table.setStyle(TableStyle(style))
    return table


def _summary_page(styles, data: dict, ai_summary: dict) -> list:
    flow = [_SectionHeading("SUMMARY"), Spacer(1, 0.3 * cm), _metric_cards(data), Spacer(1, 0.5 * cm)]

    if ai_summary.get("executive_summary"):
        for paragraph in ai_summary["executive_summary"].split("\n\n"):
            if paragraph.strip():
                flow.append(Paragraph(pdf_text(paragraph.strip()), styles["body"]))
    else:
        flow.append(Paragraph("An AI-written summary was not included with this report.", styles["muted"]))

    insights = ai_summary.get("key_insights") or []
    if insights:
        flow.append(_sub_heading("KEY INSIGHTS"))
        flow.append(_insight_box(styles, insights))

    if ai_summary.get("trends_and_anomalies"):
        flow.append(_sub_heading("TRENDS AND ANOMALIES"))
        flow.append(Paragraph(pdf_text(ai_summary["trends_and_anomalies"]), styles["body"]))

    if ai_summary.get("forward_looking_paragraph"):
        flow.append(_sub_heading("LOOKING AHEAD"))
        flow.append(Paragraph(pdf_text(ai_summary["forward_looking_paragraph"]), styles["body"]))

    flow.append(PageBreak())
    return flow


# ---------------------------------------------------------------------------
# Overview table
# ---------------------------------------------------------------------------
def _metric_table(styles, data: dict) -> Table:
    fy_windows = data["annual_totals"]
    latest_year = fy_windows[-1] if fy_windows else None

    rows = [
        ("Monthly average spend", _money(data["monthly_average_spend"])),
        ("Total confirmed spend in period", _money(data["total_spend"])),
        ("Total contributions in period", _money(data["total_income"])),
        ("Net position for period", _money(data["net_position"])),
    ]
    if latest_year:
        rows.append((f"Total for {pdf_text(latest_year['label'])}", _money(latest_year["total"])))
    funding = data.get("funding_position")
    if funding:
        rows.append(("Current balance", _money(funding["net_position"])))

    header = [Paragraph("Metric", styles["table_header"]), Paragraph("Amount", styles["table_header"])]
    table_data = [header] + [
        [Paragraph(label, styles["table_cell"]), Paragraph(value, styles["table_cell"])] for label, value in rows
    ]
    table = Table(table_data, colWidths=_cols(0.65, 0.35))
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, CARD_BG]),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("FONTNAME", (1, 1), (1, -1), "Helvetica-Bold"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEBELOW", (0, 0), (-1, 0), 0.75, NAVY),
        ("LINEBELOW", (0, 1), (-1, -1), 0.5, RULE_GREY),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
    ]))
    return table


# ---------------------------------------------------------------------------
# matplotlib -> ReportLab image bridge
# ---------------------------------------------------------------------------
def _fig_to_image(fig, target_width: float = CONTENT_WIDTH) -> Image:
    buf = BytesIO()
    fig.savefig(buf, format="png", dpi=200, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    buf.seek(0)
    iw, ih = ImageReader(buf).getSize()
    buf.seek(0)
    return Image(buf, width=target_width, height=target_width * ih / iw)


def _strip_spines(ax, keep=()) -> None:
    for spine in ("top", "right", "bottom", "left"):
        ax.spines[spine].set_visible(spine in keep)
    if "bottom" in keep:
        ax.spines["bottom"].set_color(RULE_GREY_HEX)
    if "left" in keep:
        ax.spines["left"].set_color(RULE_GREY_HEX)


# ---------------------------------------------------------------------------
# Current year charts (Part 4)
# ---------------------------------------------------------------------------
def _current_year_category_rows(data: dict):
    windows = data["annual_totals"]
    if not windows:
        return None, []
    window = windows[-1]
    rows = [
        {"id": cat["id"], "name": cat["name"], "value": float(window["by_category"].get(cat["id"], Decimal("0")))}
        for cat in data["categories"]
    ]
    rows.sort(key=lambda r: r["value"], reverse=True)
    return window["label"], rows


def _monthly_average_rows(data: dict, order_rows: list) -> list:
    elapsed_months = _elapsed_months(data)
    breakdown_by_id = {row["category_id"]: row for row in data["category_breakdown"] if row["category_id"] is not None}
    rows = []
    for r in order_rows:
        breakdown = breakdown_by_id.get(r["id"])
        total = breakdown["total"] if breakdown else Decimal("0")
        rows.append({"id": r["id"], "name": r["name"], "value": float(total) / elapsed_months})
    return rows


def _hbar_chart(rows: list, title: str, bar_colour: str):
    if not rows:
        return None
    # Reversed so the largest value — first in descending-sorted `rows` —
    # ends up drawn at the top of the horizontal bar chart, matching how a
    # ranked list normally reads top-to-bottom.
    plotted = list(reversed(rows))
    names = [r["name"] for r in plotted]
    values = [r["value"] for r in plotted]

    n = len(rows)
    width_in = CONTENT_WIDTH / 72.0
    height_in = max(1.6, 0.42 * n + 0.55)
    fig, ax = plt.subplots(figsize=(width_in, height_in))
    y_pos = range(n)
    ax.barh(y_pos, values, color=bar_colour, height=0.62, zorder=3)
    ax.set_yticks(list(y_pos))
    ax.set_yticklabels(names, fontsize=8, color=TEXT_DARK_HEX)
    ax.set_title(title, fontsize=9.5, fontweight="bold", color=TEXT_DARK_HEX, loc="left", pad=10)
    max_val = max(values) if values else 0
    ax.set_xlim(0, max_val * 1.22 if max_val else 1)
    ax.set_xticks([])
    _strip_spines(ax)
    for y, v in zip(y_pos, values):
        ax.text(v + max_val * 0.02, y, _money(v), va="center", fontsize=8, color=TEXT_DARK_HEX)
    fig.tight_layout(pad=0.6)
    return _fig_to_image(fig)


# ---------------------------------------------------------------------------
# Forecast chart
# ---------------------------------------------------------------------------
def _forecast_chart_image(data: dict):
    monthly = data["monthly_totals"]
    forecast_months = {(row["year"], row["month"]): row for row in data["forecast"]["months"]}
    if not monthly:
        return None

    labels = [row["month_label"] for row in monthly]
    values, bar_colours = [], []
    for row in monthly:
        key = (row["year"], row["month"])
        if key in forecast_months:
            values.append(float(forecast_months[key]["forecast_spend"]))
            bar_colours.append(AMBER_HEX)
        else:
            values.append(float(row["spend"]))
            bar_colours.append(ACCENT_HEX)

    width_in = CONTENT_WIDTH / 72.0
    fig, ax = plt.subplots(figsize=(width_in, 3.1))
    x = range(len(labels))
    ax.bar(x, values, color=bar_colours, width=0.62, zorder=3)
    # Headroom above the tallest bar so the legend never overlaps a bar.
    ax.set_ylim(0, max(values) * 1.25 if values else 1)
    ax.set_xticks(list(x))
    ax.set_xticklabels(labels, fontsize=7, rotation=45, ha="right", color=TEXT_DARK_HEX)
    ax.set_title("Actual vs. forecast spend", fontsize=9.5, fontweight="bold", color=TEXT_DARK_HEX, loc="left", pad=10)
    ax.yaxis.set_major_formatter(FuncFormatter(lambda v, pos: f"£{v:,.0f}"))
    ax.tick_params(axis="y", labelsize=7.5, colors=MUTED_HEX)
    ax.grid(axis="y", color="#E4E4E0", linewidth=0.6, zorder=0)
    _strip_spines(ax, keep=("bottom",))
    ax.legend(
        handles=[Patch(color=ACCENT_HEX, label="Actual"), Patch(color=AMBER_HEX, label="Forecast")],
        loc="upper left", fontsize=7.5, frameon=False,
    )
    fig.tight_layout(pad=0.6)
    return _fig_to_image(fig)


def _forecast_table(styles, data: dict) -> Table | None:
    by_category = data["forecast"]["by_category"]
    if not by_category:
        return None

    header = ["Category", "Monthly average", "Remaining months", "Forecast total"]
    rows = [[Paragraph(h, styles["table_header"]) for h in header]]
    for row in by_category:
        rows.append([
            Paragraph(pdf_text(row["category_name"]), styles["table_cell"]),
            Paragraph(_money(row["monthly_average"]), styles["table_cell"]),
            Paragraph(str(row["remaining_months"]), styles["table_cell"]),
            Paragraph(_money(row["forecast_total"]), styles["table_cell"]),
        ])

    # Planned project spend isn't tied to any one category, so it doesn't
    # appear in the by_category rows above — without this line the chart's
    # total (which does include it) wouldn't reconcile with this table's sum.
    planned_total = sum((row["planned_project_cost"] for row in data["forecast"]["months"]), Decimal("0"))
    if planned_total:
        rows.append([
            Paragraph("Planned projects (all categories)", styles["table_cell"]),
            Paragraph("—", styles["table_cell"]),
            Paragraph(str(len(data["forecast"]["months"])), styles["table_cell"]),
            Paragraph(_money(planned_total), styles["table_cell"]),
        ])

    table = Table(rows, colWidths=_cols(0.35, 0.22, 0.18, 0.25), repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, CARD_BG]),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEBELOW", (0, 0), (-1, 0), 0.75, NAVY),
        ("LINEBELOW", (0, 1), (-1, -1), 0.5, RULE_GREY),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]))
    return table


# ---------------------------------------------------------------------------
# Year on year slope chart (Part 5)
# ---------------------------------------------------------------------------
def _year_on_year_chart(data: dict):
    # Sliding window: whichever 3 FY windows are most recent within this
    # report's own annual_totals — not necessarily "today"'s FY, since this
    # renderer has no DB access and annual_totals already carries exactly
    # the windows the report was scoped to. See docs/decisions-log.md.
    recent = data["annual_totals"][-3:]
    categories = data["categories"]
    if not recent or not categories:
        return None

    labels = [w["label"] for w in recent]
    n_years = len(recent)
    x = list(range(n_years))

    width_in = CONTENT_WIDTH / 72.0
    fig, ax = plt.subplots(figsize=(width_in, 4.4))

    for i, cat in enumerate(categories):
        values = [float(w["by_category"].get(cat["id"], Decimal("0"))) for w in recent]
        colour = _hex_for(cat["colour"], i)
        ax.plot(x, values, marker="o", color=colour, linewidth=2, markersize=5, zorder=3)
        for xi, v in zip(x, values):
            ax.annotate(_money(v), (xi, v), textcoords="offset points", xytext=(0, 7),
                        ha="center", fontsize=6.5, color=TEXT_DARK_HEX)
        ax.annotate(cat["name"], (x[-1], values[-1]), textcoords="offset points", xytext=(8, 0),
                    ha="left", va="center", fontsize=8, fontweight="bold", color=colour)

    ax.set_xlim(-0.3, n_years - 1 + 1.6)
    ax.set_xticks(x)
    ax.set_xticklabels(labels, fontsize=8.5, color=TEXT_DARK_HEX)
    ax.set_title("Year on year spend by category", fontsize=9.5, fontweight="bold", color=TEXT_DARK_HEX, loc="left", pad=12)
    ax.yaxis.set_major_formatter(FuncFormatter(lambda v, pos: f"£{v:,.0f}"))
    ax.tick_params(axis="y", labelsize=7.5, colors=MUTED_HEX)
    ax.grid(axis="y", color="#E4E4E0", linewidth=0.6, zorder=0)
    _strip_spines(ax, keep=("bottom",))
    fig.tight_layout(pad=0.8)
    return _fig_to_image(fig)


# ---------------------------------------------------------------------------
# Project summary / budget vs. actual / funding position tables (Part 6)
# ---------------------------------------------------------------------------
PROJECT_STATUS_LABELS = {
    "planning": "Planning", "in_progress": "In progress",
    "completed": "Complete", "over_budget": "Over budget",
}
PROJECT_STATUS_COLOURS = {
    "planning": MUTED, "in_progress": PRIMARY, "completed": ACCENT, "over_budget": RED,
}


def _project_summary_table(styles, data: dict) -> Table | None:
    projects = data.get("planned_projects") or []
    if not projects:
        return None

    header = ["Project", "Estimated", "Actual", "Variance", "Status"]
    rows = [[Paragraph(h, styles["table_header"]) for h in header]]
    for p in projects:
        status_style = _status_style(styles["table_cell"], PROJECT_STATUS_COLOURS.get(p["project_status"], TEXT_DARK))
        rows.append([
            Paragraph(pdf_text(p["name"]), styles["table_cell"]),
            Paragraph(_money(p["estimated_cost"]), styles["table_cell"]),
            Paragraph(_money(p["actual_cost"]), styles["table_cell"]),
            Paragraph(_money(p["variance"]), styles["table_cell"]),
            Paragraph(PROJECT_STATUS_LABELS.get(p["project_status"], p["project_status"]), status_style),
        ])

    totals = data.get("project_summary_totals") or {}
    rows.append([
        Paragraph("Total", styles["table_cell"]),
        Paragraph(_money(totals.get("total_estimated", 0)), styles["table_cell"]),
        Paragraph(_money(totals.get("total_actual", 0)), styles["table_cell"]),
        Paragraph(_money(totals.get("total_variance", 0)), styles["table_cell"]),
        Paragraph("", styles["table_cell"]),
    ])

    table = Table(rows, colWidths=_cols(0.32, 0.15, 0.15, 0.15, 0.23), repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, CARD_BG]),
        ("BACKGROUND", (0, -1), (-1, -1), CARD_BG),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEBELOW", (0, 0), (-1, 0), 0.75, NAVY),
        ("LINEBELOW", (0, 1), (-1, -1), 0.5, RULE_GREY),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]))
    return table


BUDGET_STATUS_LABELS = {"under_budget": "On track", "warning": "Warning", "over_budget": "Over budget"}
BUDGET_STATUS_COLOURS = {"under_budget": ACCENT, "warning": AMBER, "over_budget": RED}


def _progress_cell(percent, colour, width: float = 56, height: float = 20) -> Drawing:
    d = Drawing(width, height)
    pct = float(percent or 0)
    bar_w = width - 4
    bar_h = 6
    d.add(Rect(2, 2, bar_w, bar_h, fillColor=CARD_BG, strokeColor=RULE_GREY, strokeWidth=0.5, rx=2, ry=2))
    fill_w = max(0.0, min(pct, 100.0)) / 100.0 * bar_w
    if fill_w > 0:
        d.add(Rect(2, 2, fill_w, bar_h, fillColor=colour, strokeColor=None, rx=2, ry=2))
    d.add(String(2, height - 9, f"{pct:.0f}%", fontName="Helvetica", fontSize=8, fillColor=TEXT_DARK))
    return d


def _budget_table(styles, data: dict) -> Table | None:
    budget_vs_actual = data.get("budget_vs_actual")
    if not budget_vs_actual:
        return None

    header = ["Category", "Annual budget", "Actual", "Variance", "% used", "Status"]
    rows = [[Paragraph(h, styles["table_header"]) for h in header]]
    for row in budget_vs_actual["rows"]:
        colour = BUDGET_STATUS_COLOURS[row["status"]]
        status_style = _status_style(styles["table_cell"], colour)
        rows.append([
            Paragraph(pdf_text(row["category_name"]), styles["table_cell"]),
            Paragraph(_money(row["annual_budget"]), styles["table_cell"]),
            Paragraph(_money(row["actual_spend"]), styles["table_cell"]),
            Paragraph(_money(row["variance"]), styles["table_cell"]),
            _progress_cell(row["percent_used"], colour),
            Paragraph(BUDGET_STATUS_LABELS[row["status"]], status_style),
        ])

    totals = budget_vs_actual["totals"]
    rows.append([
        Paragraph("Total", styles["table_cell"]),
        Paragraph(_money(totals["total_budget"]), styles["table_cell"]),
        Paragraph(_money(totals["total_actual"]), styles["table_cell"]),
        Paragraph(_money(totals["total_variance"]), styles["table_cell"]),
        Paragraph("", styles["table_cell"]),
        Paragraph(BUDGET_STATUS_LABELS[totals["overall_status"]], _status_style(styles["table_cell"], BUDGET_STATUS_COLOURS[totals["overall_status"]])),
    ])

    table = Table(rows, colWidths=_cols(0.20, 0.14, 0.14, 0.14, 0.13, 0.25), repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, CARD_BG]),
        ("BACKGROUND", (0, -1), (-1, -1), CARD_BG),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("ALIGN", (1, 0), (3, -1), "RIGHT"),
        ("ALIGN", (4, 0), (4, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEBELOW", (0, 0), (-1, 0), 0.75, NAVY),
        ("LINEBELOW", (0, 1), (-1, -1), 0.5, RULE_GREY),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]))
    return table


def _funding_table(styles, data: dict) -> Table | None:
    funding = data.get("funding_position")
    if not funding:
        return None

    rows = [[Paragraph(h, styles["table_header"]) for h in ["", "Amount"]]]
    entries = []
    if funding["financial_year_label"]:
        entries.append(("Financial year", pdf_text(funding["financial_year_label"]), None))
    if funding["opening_balance"] is not None:
        entries.append(("Opening balance", _money(funding["opening_balance"]), None))
    entries.append(("Contributions in period", _money(funding["total_contributions"]), None))
    entries.append(("Spend in period", _money(funding["total_spend"]), None))
    net_colour = ACCENT if funding["net_position"] >= 0 else RED
    entries.append(("Net position", _money(funding["net_position"]), net_colour))

    for label, value, colour in entries:
        value_style = _status_style(styles["table_cell"], colour) if colour else styles["table_cell"]
        rows.append([Paragraph(label, styles["table_cell"]), Paragraph(value, value_style)])

    table = Table(rows, colWidths=_cols(0.6, 0.4), repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, CARD_BG]),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("FONTNAME", (1, 1), (1, -2), "Helvetica-Bold"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEBELOW", (0, 0), (-1, 0), 0.75, NAVY),
        ("LINEBELOW", (0, 1), (-1, -1), 0.5, RULE_GREY),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]))
    return table


# ---------------------------------------------------------------------------
# Footer (Part 8)
# ---------------------------------------------------------------------------
def _footer_left_text(site_name: str) -> str:
    if site_name and site_name != "Keep Track":
        return f"{site_name} — Keep Track"
    return "Keep Track"


class _NumberedCanvas(Canvas):
    """Draws the footer on every page except the cover (page 1, which has
    its own branding — see docs/decisions-log.md), with a real "Page X of Y"
    — the total page count isn't known until the whole document has been
    laid out, so each page is buffered via showPage() and the footer is
    drawn retroactively for all of them during save(), the standard
    ReportLab recipe for this. X/Y count only the footer-bearing pages (the
    cover is excluded from the count as well as unnumbered), on the
    assumption — true for this document's story — that the cover is always
    exactly page 1."""

    def __init__(self, *args, footer_left_text: str, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []
        self._footer_left_text = footer_left_text

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total_content_pages = max(0, len(self._saved_page_states) - 1)
        content_page_number = 0
        for state in self._saved_page_states:
            self.__dict__.update(state)
            if self._pageNumber > 1:
                content_page_number += 1
                self._draw_footer(content_page_number, total_content_pages)
            Canvas.showPage(self)
        Canvas.save(self)

    def _draw_footer(self, page_number: int, total_pages: int):
        self.saveState()
        self.setStrokeColor(RULE_GREY)
        self.setLineWidth(0.5)
        self.line(PAGE_MARGIN, 1.4 * cm, A4[0] - PAGE_MARGIN, 1.4 * cm)
        self.setFont("Helvetica", 8)
        self.setFillColor(MUTED)
        self.drawString(PAGE_MARGIN, 1 * cm, self._footer_left_text)
        self.drawRightString(A4[0] - PAGE_MARGIN, 1 * cm, f"Page {page_number} of {total_pages}")
        self.restoreState()


def generate_report_pdf(
    data: dict,
    ai_summary: dict,
    title: str,
    site_name: str,
    generated_by_username: str,
    generated_at: datetime,
) -> bytes:
    """Render the full report PDF and return its bytes (caller writes them to storage)."""
    styles = _build_styles()
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=PAGE_MARGIN,
        rightMargin=PAGE_MARGIN,
        topMargin=PAGE_MARGIN,
        bottomMargin=PAGE_MARGIN,
        title=title,
    )

    report_type_label = REPORT_TYPE_LABELS.get(data["report_type"], data["report_type"].title())

    story = [PageBreak()]
    story += _summary_page(styles, data, ai_summary)

    story.append(_SectionHeading("OVERVIEW"))
    story.append(_metric_table(styles, data))

    current_label, current_rows = _current_year_category_rows(data)
    if current_rows:
        story.append(PageBreak())
        story.append(_SectionHeading(f"CURRENT YEAR — {current_label}"))
        chart1 = _hbar_chart(current_rows, f"Spend by category — {current_label}", PRIMARY_HEX)
        if chart1:
            story.append(chart1)
        chart2 = _hbar_chart(_monthly_average_rows(data, current_rows), "Monthly average cost by category", ACCENT_HEX)
        if chart2:
            story.append(Spacer(1, 0.6 * cm))
            story.append(chart2)

    if len(data["annual_totals"]) >= 1:
        story.append(PageBreak())
        story.append(_SectionHeading("YEAR ON YEAR COMPARISON"))
        if len(data["annual_totals"]) < 2:
            story.append(Paragraph(
                "Not enough historical data for year on year comparison. "
                "This will populate as more financial years are recorded.",
                styles["muted"],
            ))
        else:
            yoy_chart = _year_on_year_chart(data)
            if yoy_chart:
                story.append(yoy_chart)

    if data["report_type"] in ("forecast", "combined") and data["forecast"]["months"]:
        story.append(PageBreak())
        story.append(_SectionHeading("FORECAST"))
        forecast_chart = _forecast_chart_image(data)
        if forecast_chart:
            story.append(_sub_heading("ACTUAL VS. FORECAST SPEND"))
            story.append(forecast_chart)
        forecast_table = _forecast_table(styles, data)
        if forecast_table:
            story.append(_sub_heading("FORECAST BREAKDOWN BY CATEGORY"))
            story.append(forecast_table)

    project_summary_table = _project_summary_table(styles, data)
    if project_summary_table:
        story.append(PageBreak())
        story.append(_SectionHeading("PROJECT SUMMARY"))
        story.append(Paragraph(
            "Planned projects due in this period, with actual spend to date against their estimate.",
            styles["muted"],
        ))
        story.append(Spacer(1, 0.3 * cm))
        story.append(project_summary_table)

    budget_table = _budget_table(styles, data)
    if budget_table:
        story.append(PageBreak())
        story.append(_SectionHeading("BUDGET VS. ACTUAL"))
        story.append(Paragraph(
            "Each category's annual budget against actual spend in this report's period.",
            styles["muted"],
        ))
        story.append(Spacer(1, 0.3 * cm))
        story.append(budget_table)

    funding_table = _funding_table(styles, data)
    if funding_table:
        story.append(PageBreak())
        story.append(_SectionHeading("FUNDING POSITION"))
        story.append(funding_table)

    story.append(PageBreak())
    story.append(_SectionHeading("NOTES"))
    story.append(Paragraph("Add your notes here before sharing this report.", styles["muted"]))
    for _ in range(8):
        story.append(Spacer(1, 1 * cm))
        story.append(HRFlowable(width="100%", thickness=0.5, color=RULE_GREY))

    footer_left_text = _footer_left_text(site_name)
    cover_kwargs = dict(
        site_name=site_name, report_type_label=report_type_label,
        date_from=data["date_from"], date_to=data["date_to"],
        generated_by=generated_by_username, generated_at=generated_at,
    )
    doc.build(
        story,
        onFirstPage=lambda canvas, doc: _draw_cover_page(canvas, doc, **cover_kwargs),
        canvasmaker=lambda *args, **kwargs: _NumberedCanvas(*args, footer_left_text=footer_left_text, **kwargs),
    )
    return buffer.getvalue()
