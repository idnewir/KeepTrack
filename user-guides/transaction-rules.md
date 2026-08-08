# Transaction Rules

Transaction rules automatically categorise invoices based on their supplier name — so "Corona Energy" always lands in Electricity, "BT" always lands in Broadband, without anyone having to pick a category by hand. They take priority over AI's own guess, and they work even when AI is switched off entirely.

## Why use rules

AI extraction does a good job of picking a category most of the time, but it can be inconsistent — the same supplier might land in slightly different categories from one invoice to the next, especially if the invoice text is ambiguous. Rules remove that guesswork for the suppliers you deal with regularly: once a rule exists, that supplier is categorised the same way every single time.

Rules are also the only automatic categorisation available when AI isn't configured or is switched off — see [Feature Modules](feature-modules.md#ai-degradation--what-works-without-ai) for the rest of what still works without AI.

## When rules are applied

Rules run automatically at three points:

- **Uploading an invoice** — after AI reads the supplier name (or immediately, if AI is off and you type the supplier yourself), a matching rule overrides whatever category AI suggested.
- **Importing invoices** — both the [CSV import and PDF import](uploading-invoices.md#bringing-in-historical-data-bulk-import) workflows check each invoice's supplier against your rules before falling back to the CSV's own Category column or AI's guess.
- **The watched folder** — if [Folder Integration](folder-integration.md) is picking up invoices automatically, rules are applied to each one exactly as they would be for a manual upload.

You never have to remember to apply a rule yourself — if one matches, it's used.

## Creating your first rule

1. Go to **Settings → General → Transaction Rules**, then click **Manage rules**.
2. Click **+ Add rule**.
3. Fill in:
   - **Rule name** — a friendly description, e.g. "BT Broadband". This is just for your own reference in the rules table.
   - **Match type** — see below.
   - **Match value** — the text to match against the supplier name.
   - **Category** — which category to assign when this rule matches.
   - **Priority** — leave at 0 unless you have overlapping rules (see below).
   - **Active** — on by default.
4. Click **Add rule**. It takes effect immediately for the next invoice processed.

## Understanding match types

- **Contains** (the default) — the supplier name contains this text anywhere. e.g. a match value of "BT" matches "BT Broadband Ltd" and "Payment to BT". This is the most forgiving option and the right choice for most rules.
- **Exact match** — the supplier name must be identical to the match value, start to finish. Use this when a broader match would accidentally catch suppliers you didn't mean to include.
- **Starts with** — the supplier name must begin with this text. Useful when a supplier's name always starts the same way but the ending varies (e.g. invoice numbers or branch names tacked on the end).

All matching is **case-insensitive** — "bt", "BT", and "Bt" are all treated the same, since suppliers rarely write their own name consistently across every invoice.

## Testing before you save

Not sure whether a rule will catch what you expect? Use the **Test a supplier name** box below the rules table:

1. Type in a supplier name — a real one from a recent invoice, or a hypothetical one you're checking.
2. Click **Test**.
3. Keep Track tells you either which rule would match and what category it would assign, or that no rule matches (meaning AI extraction or manual entry would be used instead).

This checks against your rules exactly as they're currently saved, so it's a safe way to check a new rule's wording before it starts affecting real invoices — or to double check why a past invoice was categorised the way it was.

## Suggestions from your invoice history

Keep Track keeps an eye on invoices where you've manually changed the category after it was first set — a strong sign that a rule would save you the same correction next time. When enough invoices from the same supplier have consistently been recategorised the same way, a suggestion appears at the top of the Transaction Rules page:

> Supplier **[X]** is usually categorised as **[category]** — create a rule?

Click **Create rule** on a suggestion to add it instantly as a **Contains** rule — no form to fill in. If you'd rather not see suggestions right now, click **Dismiss suggestions**; they'll reappear next time you visit the page.

Suppliers already covered by an existing active rule are never suggested again.

## Priority — when more than one rule could match

Every rule has a **priority** (default 0, higher numbers run first). When a supplier name matches more than one rule, the highest-priority active rule wins. This matters if you have a broad rule alongside a more specific exception — for example:

- A **Contains** rule matching "Energy" → General Maintenance, priority 0.
- A more specific **Exact match** rule for "Corona Energy" → Electricity, priority 10.

Without priority, either rule might apply depending on their order. Giving the more specific rule a higher priority guarantees it's checked first, so "Corona Energy" always lands in Electricity rather than the broader catch-all.

Rules with equal priority are checked in the order they were created.

## Managing rules

The rules table (**Settings → General → Transaction Rules → Manage rules**) lists every rule with its priority, name, match type, match value, category, and status:

- **Edit** — change any field of an existing rule.
- **Disable / Enable** — temporarily switch a rule off without deleting it. A disabled rule is skipped entirely, as if it didn't exist.
- **Delete** — remove a rule for good, with a confirmation step first.

## Rules vs AI — rules always win

If both a rule and AI extraction could apply to the same invoice, **the rule always wins**. AI's own category guess is simply replaced by the rule's category, and a note is added to the invoice — *"Category set by rule: [rule name]"* — so it's clear afterwards why that category was chosen. This shows as a small **Set by rule** badge next to the Category field on the review card; if you change the category yourself, the badge disappears, since you've made an active choice that overrides the rule for that one invoice.

Rules do not affect existing, already-confirmed invoices — they only apply going forward.

## Related guides

- [Uploading Invoices](uploading-invoices.md) — where rules take effect during upload and import.
- [Feature Modules](feature-modules.md#ai-degradation--what-works-without-ai) — what else still works without AI.
- [Settings Guide](settings-guide.md) — the General section rules live under.
