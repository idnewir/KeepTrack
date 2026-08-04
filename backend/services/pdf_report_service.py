"""PDF report generation via ReportLab.

Builds the full multi-section PDF a generated report becomes: a cover page,
an AI-written summary, overview metrics, annual/category/forecast charts, a
funding position table, and a blank context-notes section left for manual
annotation afterwards. Styled with Keep Track's brand colours.

No build_khoc_report.py exists anywhere in this repo to copy structure or
chart styling from (checked both the repo root and the whole tree) — the
layout below was built directly from docs/features.md#6 and this task's own
brief instead. See docs/decisions-log.md.
"""
from datetime import datetime
from decimal import Decimal
from io import BytesIO

from reportlab.graphics.charts.barcharts import HorizontalBarChart, VerticalBarChart
from reportlab.graphics.charts.legends import Legend
from reportlab.graphics.shapes import Drawing
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    NextPageTemplate,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.flowables import HRFlowable

PRIMARY = colors.HexColor("#2D6B9F")
ACCENT = colors.HexColor("#1D9E75")
AMBER = colors.HexColor("#EF9F27")
TEXT_DARK = colors.HexColor("#2C2C2A")
TEXT_MUTED = colors.HexColor("#6B6B67")
BORDER = colors.HexColor("#E4E4E0")
NEGATIVE = colors.HexColor("#A83232")

# Used when a category's own colour can't be resolved (e.g. "Uncategorised",
# which has none) — cycles through the brand palette plus a couple of extra
# hues so charts with more categories than brand colours still stay legible.
CATEGORY_FALLBACK_PALETTE = [
    PRIMARY, ACCENT, AMBER,
    colors.HexColor("#7C5CBF"), colors.HexColor("#A83232"), colors.HexColor("#3C9DBF"),
]

PAGE_MARGIN = 2 * cm


def _money(amount) -> str:
    return f"£{Decimal(amount or 0):,.2f}"


def _colour_for(hex_value: str | None, index: int):
    if hex_value:
        try:
            return colors.HexColor(hex_value)
        except ValueError:
            pass
    return CATEGORY_FALLBACK_PALETTE[index % len(CATEGORY_FALLBACK_PALETTE)]


def _build_styles():
    base = getSampleStyleSheet()
    return {
        "cover_title": ParagraphStyle(
            "cover_title", parent=base["Title"], fontSize=28, leading=34, textColor=PRIMARY, spaceAfter=10,
        ),
        "cover_site": ParagraphStyle(
            "cover_site", parent=base["Normal"], fontSize=16, leading=22, textColor=TEXT_DARK,
            alignment=1, spaceAfter=4,
        ),
        "cover_meta": ParagraphStyle(
            "cover_meta", parent=base["Normal"], fontSize=11, leading=17, textColor=TEXT_MUTED, alignment=1,
        ),
        "h1": ParagraphStyle(
            "h1", parent=base["Heading1"], fontSize=17, leading=21, textColor=PRIMARY,
            spaceBefore=6, spaceAfter=10,
        ),
        "h2": ParagraphStyle(
            "h2", parent=base["Heading2"], fontSize=12.5, leading=16, textColor=TEXT_DARK,
            spaceBefore=16, spaceAfter=6,
        ),
        "body": ParagraphStyle(
            "body", parent=base["Normal"], fontSize=10.5, leading=16, textColor=TEXT_DARK, spaceAfter=8,
        ),
        "muted": ParagraphStyle(
            "muted", parent=base["Normal"], fontSize=9, leading=13, textColor=TEXT_MUTED,
        ),
        "insight": ParagraphStyle(
            "insight", parent=base["Normal"], fontSize=10.5, leading=15, textColor=TEXT_DARK,
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


def _cover_page(styles, title: str, site_name: str, date_from, date_to, generated_at: datetime, report_type: str) -> list:
    label = {"historical": "Historical analysis", "forecast": "Forecast", "combined": "Historical & forecast"}
    return [
        Spacer(1, 6 * cm),
        Paragraph(title, styles["cover_title"]),
        Paragraph(site_name, styles["cover_site"]),
        Spacer(1, 0.4 * cm),
        HRFlowable(width="40%", thickness=1, color=BORDER, hAlign="CENTER", spaceAfter=12),
        Paragraph(f"{date_from:%d %B %Y} – {date_to:%d %B %Y}", styles["cover_meta"]),
        Paragraph(label.get(report_type, report_type.title()), styles["cover_meta"]),
        Spacer(1, 0.6 * cm),
        Paragraph(f"Generated {generated_at:%d %B %Y at %H:%M}", styles["cover_meta"]),
        PageBreak(),
    ]


def _summary_page(styles, ai_summary: dict) -> list:
    flow = [Paragraph("Executive summary", styles["h1"])]

    if ai_summary.get("executive_summary"):
        for paragraph in ai_summary["executive_summary"].split("\n\n"):
            if paragraph.strip():
                flow.append(Paragraph(paragraph.strip(), styles["body"]))
    else:
        flow.append(Paragraph(
            "An AI-written summary was not included with this report.", styles["muted"],
        ))

    insights = ai_summary.get("key_insights") or []
    if insights:
        flow.append(Paragraph("Key insights", styles["h2"]))
        for insight in insights:
            flow.append(Paragraph(f"• {insight}", styles["insight"]))

    if ai_summary.get("trends_and_anomalies"):
        flow.append(Paragraph("Trends and anomalies", styles["h2"]))
        flow.append(Paragraph(ai_summary["trends_and_anomalies"], styles["body"]))

    if ai_summary.get("forward_looking_paragraph"):
        flow.append(Paragraph("Looking ahead", styles["h2"]))
        flow.append(Paragraph(ai_summary["forward_looking_paragraph"], styles["body"]))

    flow.append(PageBreak())
    return flow


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
        rows.append((f"Total for {latest_year['label']}", _money(latest_year["total"])))
    funding = data.get("funding_position")
    if funding:
        rows.append(("Current balance", _money(funding["net_position"])))

    table_data = [[Paragraph(label, styles["table_cell"]), Paragraph(value, styles["table_cell"])] for label, value in rows]
    table = Table(table_data, colWidths=[9 * cm, 6 * cm])
    table.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F7F7F5")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("FONTNAME", (1, 0), (1, -1), "Helvetica-Bold"),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
    ]))
    return table


def _annual_totals_chart(data: dict) -> Drawing | None:
    windows = data["annual_totals"]
    categories = data["categories"]
    if not windows or not categories:
        return None

    drawing = Drawing(460, 240)
    chart = VerticalBarChart()
    chart.x, chart.y = 50, 45
    chart.width, chart.height = 330, 165
    chart.categoryAxis.style = "stacked"
    chart.categoryAxis.categoryNames = [w["label"] for w in windows]
    chart.categoryAxis.labels.fontSize = 8
    chart.valueAxis.valueMin = 0
    chart.valueAxis.labelTextFormat = "£%d"
    chart.valueAxis.labels.fontSize = 8
    chart.barSpacing = 4
    chart.groupSpacing = 14
    chart.strokeColor = None

    chart.data = [[float(w["by_category"].get(cat["id"], Decimal("0"))) for w in windows] for cat in categories]
    for i, cat in enumerate(categories):
        chart.bars[i].fillColor = _colour_for(cat["colour"], i)

    drawing.add(chart)

    legend = Legend()
    legend.x, legend.y = 390, 195
    legend.dx, legend.dy = 8, 8
    legend.fontSize = 8
    legend.alignment = "right"
    legend.columnMaximum = 12
    legend.colorNamePairs = [(_colour_for(cat["colour"], i), cat["name"]) for i, cat in enumerate(categories)]
    drawing.add(legend)

    return drawing


def _monthly_average_chart(data: dict) -> Drawing | None:
    breakdown = [row for row in data["category_breakdown"] if row["total"]]
    if not breakdown:
        return None

    elapsed_months = max(
        1,
        sum(1 for row in data["monthly_totals"] if (row["year"], row["month"]) <= (data["date_to"].year, data["date_to"].month)),
    )

    drawing_height = 40 + 22 * len(breakdown)
    drawing = Drawing(460, drawing_height)
    chart = HorizontalBarChart()
    chart.x, chart.y = 130, 20
    chart.width, chart.height = 300, drawing_height - 40
    chart.categoryAxis.categoryNames = [row["category_name"] for row in breakdown]
    chart.categoryAxis.labels.fontSize = 8
    chart.valueAxis.valueMin = 0
    chart.valueAxis.labelTextFormat = "£%d"
    chart.valueAxis.labels.fontSize = 8
    chart.barWidth = 12
    chart.barSpacing = 6
    chart.strokeColor = None

    chart.data = [[float(row["total"]) / elapsed_months for row in breakdown]]
    for i, row in enumerate(breakdown):
        chart.bars[i].fillColor = _colour_for(row["category_colour"], i)

    drawing.add(chart)
    return drawing


def _forecast_chart(data: dict) -> Drawing | None:
    monthly = data["monthly_totals"]
    forecast_months = {(row["year"], row["month"]): row for row in data["forecast"]["months"]}
    if not monthly:
        return None

    drawing = Drawing(460, 220)
    chart = VerticalBarChart()
    chart.x, chart.y = 50, 45
    chart.width, chart.height = 330, 150
    chart.categoryAxis.style = "stacked"
    chart.categoryAxis.categoryNames = [row["month_label"] for row in monthly]
    chart.categoryAxis.labels.fontSize = 7
    chart.categoryAxis.labels.angle = 45
    chart.categoryAxis.labels.dy = -8
    chart.valueAxis.valueMin = 0
    chart.valueAxis.labelTextFormat = "£%d"
    chart.valueAxis.labels.fontSize = 8
    chart.barSpacing = 3
    chart.strokeColor = None

    actual_series = []
    forecast_series = []
    for row in monthly:
        key = (row["year"], row["month"])
        if key in forecast_months:
            actual_series.append(0.0)
            forecast_series.append(float(forecast_months[key]["forecast_spend"]))
        else:
            actual_series.append(float(row["spend"]))
            forecast_series.append(0.0)

    chart.data = [actual_series, forecast_series]
    chart.bars[0].fillColor = ACCENT
    chart.bars[1].fillColor = AMBER

    drawing.add(chart)

    legend = Legend()
    legend.x, legend.y = 390, 175
    legend.dx, legend.dy = 8, 8
    legend.fontSize = 8
    legend.alignment = "right"
    legend.colorNamePairs = [(ACCENT, "Actual"), (AMBER, "Forecast")]
    drawing.add(legend)

    return drawing


def _forecast_table(styles, data: dict) -> Table | None:
    by_category = data["forecast"]["by_category"]
    if not by_category:
        return None

    header = ["Category", "Monthly average", "Remaining months", "Forecast total"]
    rows = [[Paragraph(h, styles["table_header"]) for h in header]]
    for row in by_category:
        rows.append([
            Paragraph(row["category_name"], styles["table_cell"]),
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

    table = Table(rows, colWidths=[6 * cm, 3.5 * cm, 3 * cm, 3.5 * cm], repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), PRIMARY),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F7F7F5")]),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
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
        entries.append(("Financial year", funding["financial_year_label"]))
    if funding["opening_balance"] is not None:
        entries.append(("Opening balance", _money(funding["opening_balance"])))
    entries.append(("Contributions in period", _money(funding["total_contributions"])))
    entries.append(("Spend in period", _money(funding["total_spend"])))
    entries.append(("Net position", _money(funding["net_position"])))

    for label, value in entries:
        rows.append([Paragraph(label, styles["table_cell"]), Paragraph(value, styles["table_cell"])])

    table = Table(rows, colWidths=[9 * cm, 6 * cm], repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), ACCENT),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F7F7F5")]),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("FONTNAME", (1, 1), (1, -1), "Helvetica-Bold"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]))
    return table


def _footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.5)
    canvas.line(PAGE_MARGIN, 1.4 * cm, A4[0] - PAGE_MARGIN, 1.4 * cm)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(PAGE_MARGIN, 1 * cm, "Keep Track")
    canvas.drawRightString(A4[0] - PAGE_MARGIN, 1 * cm, f"Page {doc.page}")
    canvas.restoreState()


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

    story = []
    story += _cover_page(styles, title, site_name, data["date_from"], data["date_to"], generated_at, data["report_type"])
    story += _summary_page(styles, ai_summary)

    story.append(Paragraph("Overview", styles["h1"]))
    story.append(_metric_table(styles, data))

    annual_chart = _annual_totals_chart(data)
    if annual_chart:
        story.append(Paragraph("Annual totals by category", styles["h2"]))
        story.append(annual_chart)

    average_chart = _monthly_average_chart(data)
    if average_chart:
        story.append(Paragraph("Monthly average cost by category", styles["h2"]))
        story.append(average_chart)

    if data["report_type"] in ("forecast", "combined") and data["forecast"]["months"]:
        story.append(PageBreak())
        story.append(Paragraph("Forecast", styles["h1"]))
        forecast_chart = _forecast_chart(data)
        if forecast_chart:
            story.append(Paragraph("Actual vs. forecast spend", styles["h2"]))
            story.append(forecast_chart)
        forecast_table = _forecast_table(styles, data)
        if forecast_table:
            story.append(Paragraph("Forecast breakdown by category", styles["h2"]))
            story.append(forecast_table)

    funding_table = _funding_table(styles, data)
    if funding_table:
        story.append(PageBreak())
        story.append(Paragraph("Funding position", styles["h1"]))
        story.append(funding_table)

    story.append(PageBreak())
    story.append(Paragraph("Notes", styles["h1"]))
    story.append(Paragraph(
        "Space for manual notes and context — add any comments relevant to this report here before sharing it.",
        styles["muted"],
    ))
    for _ in range(8):
        story.append(Spacer(1, 1 * cm))
        story.append(HRFlowable(width="100%", thickness=0.5, color=BORDER))

    story.append(Spacer(1, 0.6 * cm))
    story.append(Paragraph(f"Generated by {generated_by_username}", styles["muted"]))

    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)
    return buffer.getvalue()
