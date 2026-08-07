"""Debt payoff maths — pure functions, no DB access, so a change to interest
rate/payment/balance anywhere (the form's live preview, the list endpoint,
the detail page's calculator) always agrees, since every caller runs the
same computation rather than a copy of it. See docs/decisions-log.md.

Amortisation is modelled with equal monthly payments (the standard "n =
-ln(1 - rB/A) / ln(1+r)" formula), rounded up to a whole number of months —
an approximation (the true final payment is usually smaller than the rest),
consistent with the ceiling-division approach already used elsewhere in this
app for month counts (e.g. services/project_service.py's funding_progress).
"""
import math
from decimal import Decimal, ROUND_HALF_UP

WARNING_MESSAGE = "Payment does not cover interest — balance is growing"


def _round2(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def calculate_payoff(balance: Decimal, annual_rate: Decimal, monthly_payment: Decimal) -> dict:
    """Months remaining, total interest, and total to pay for a debt held at
    a single, constant interest rate.

    Returns {"months_remaining", "total_interest", "total_to_pay", "warning",
    "warning_message"} — months_remaining/total_interest/total_to_pay are
    None and warning is True when monthly_payment doesn't even cover the
    interest accruing each month, since the debt would never be paid off at
    that rate (the balance grows, not shrinks) and a month count would be
    meaningless.
    """
    balance = Decimal(balance)
    annual_rate = Decimal(annual_rate)
    monthly_payment = Decimal(monthly_payment)

    if balance <= 0:
        return {
            "months_remaining": 0,
            "total_interest": Decimal("0.00"),
            "total_to_pay": Decimal("0.00"),
            "warning": False,
            "warning_message": None,
        }

    monthly_rate = annual_rate / Decimal("100") / Decimal("12")
    monthly_interest = balance * monthly_rate

    if monthly_rate > 0 and monthly_payment <= monthly_interest:
        return {
            "months_remaining": None,
            "total_interest": None,
            "total_to_pay": None,
            "warning": True,
            "warning_message": WARNING_MESSAGE,
        }

    if monthly_rate == 0:
        # No interest at all — total_to_pay is exactly the balance, not
        # monthly_payment * ceil(months), which would otherwise attribute a
        # final, smaller-than-usual payment's "rounding up" to fake interest.
        months = max(math.ceil(balance / monthly_payment), 1)
        total_interest = Decimal("0.00")
    else:
        # Simulated month by month (rather than the closed-form
        # amortisation formula applied to a flat monthly_payment * months)
        # so total_interest is the actual sum of interest accrued each
        # month — correct even though the real final payment is smaller
        # than every payment before it. 1200 months (100 years) is a safety
        # cap; a debt actually taking that long would already have
        # triggered the payment-below-interest warning above.
        b = balance
        total_interest = Decimal("0.00")
        months = 0
        for _ in range(1200):
            interest = b * monthly_rate
            total_interest += interest
            b = b + interest - monthly_payment
            months += 1
            if b <= 0:
                break
        months = max(months, 1)

    total_to_pay = balance + total_interest

    return {
        "months_remaining": months,
        "total_interest": _round2(total_interest),
        "total_to_pay": _round2(total_to_pay),
        "warning": False,
        "warning_message": None,
    }


def calculate_dual_scenario(
    balance: Decimal,
    promo_rate: Decimal,
    standard_rate: Decimal,
    monthly_payment: Decimal,
    promo_months_remaining: int,
) -> dict:
    """Two payoff projections for a promotional/0% debt:

    - "current": payoff as if the promotional rate applied for the entire
      remaining balance — the optimistic "best case" figure, for comparison.
    - "standard": the realistic projection — the promotional rate applies
      for promo_months_remaining more months (simulated month by month,
      since the balance itself is changing during that window), then the
      standard rate takes over for whatever balance is left.

    Returns {"current": <calculate_payoff shape>, "standard": <same shape>}.
    """
    balance = Decimal(balance)
    promo_rate = Decimal(promo_rate)
    standard_rate = Decimal(standard_rate)
    monthly_payment = Decimal(monthly_payment)
    promo_months_remaining = max(int(promo_months_remaining or 0), 0)

    current = calculate_payoff(balance, promo_rate, monthly_payment)

    remaining_balance = balance
    promo_monthly_rate = promo_rate / Decimal("100") / Decimal("12")
    promo_interest_paid = Decimal("0.00")
    months_in_promo = 0
    for _ in range(promo_months_remaining):
        if remaining_balance <= 0:
            break
        interest = remaining_balance * promo_monthly_rate
        promo_interest_paid += interest
        remaining_balance = remaining_balance + interest - monthly_payment
        months_in_promo += 1
        if remaining_balance <= 0:
            remaining_balance = Decimal("0.00")
            break

    if remaining_balance <= 0:
        standard = {
            "months_remaining": months_in_promo,
            "total_interest": _round2(promo_interest_paid),
            "total_to_pay": _round2(balance + promo_interest_paid),
            "warning": False,
            "warning_message": None,
        }
    else:
        after_promo = calculate_payoff(remaining_balance, standard_rate, monthly_payment)
        if after_promo["warning"]:
            standard = after_promo
        else:
            standard = {
                "months_remaining": months_in_promo + after_promo["months_remaining"],
                "total_interest": _round2(promo_interest_paid + after_promo["total_interest"]),
                "total_to_pay": _round2(balance + promo_interest_paid + after_promo["total_interest"]),
                "warning": False,
                "warning_message": None,
            }

    return {"current": current, "standard": standard}
