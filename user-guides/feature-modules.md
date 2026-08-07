# Feature Modules

Keep Track is built to work for very different kinds of user — a charity committee tracking contributions and invoices, or a single person keeping an eye on household bills. Feature modules are how the same installation adapts to both: an Administrator can turn whole feature areas on or off, so the app only shows what's actually needed.

## What modules are

A module is a whole feature area — Reconciliation, Planned Projects, AI Extraction, and so on. Turning one off doesn't delete anything or break anything behind the scenes; it just removes that feature from the menus and stops it from being used until it's switched back on.

Think of it like hiding a room in a building rather than knocking it down. Everything inside is exactly as you left it, waiting for the door to be unlocked again.

## Which modules are available

| Module | On by default? | Needs setup? | What it covers |
|---|---|---|---|
| **Reconciliation** | Yes | No | Comparing your calculated balance against the actual bank balance each month. |
| **Planned Projects** | Yes | No | Logging future planned spend and linking invoices to it as they come in. |
| **Signing & Export** | Yes | No | The signature step when confirming an invoice, and downloading signed PDFs. |
| **AI Extraction** | Yes | Yes | Automatically reading uploaded invoices instead of typing everything in by hand. |
| **Bulk Import** | Yes | No | Bringing in historical invoices in bulk, from a CSV spreadsheet or a batch of PDFs. |
| **Full Text Search** | Yes | No | The search bar in the header, and searching across invoices, projects, and contributions. |
| **Folder Integration** | No | Yes | Automatically picking up new invoices from a shared network folder, and automatically saving signed PDFs back out to one. |
| **Debt Tracking** | No | Yes | Tracking loans, credit cards, mortgages, and other debts, with payment logging and a payoff calculator. You can give this module your own name when you turn it on. Turning it on also switches the Dashboard to Personal Finance mode and adds a **Debts** link to the sidebar. See the dedicated [Debt Tracking](debt-tracking.md) guide. |
| **Budget Planning** | No | Yes | Setting a monthly budget and splitting your income across categories. You can give this module your own name when you turn it on. |

The first six are switched on for everyone by default, since they cover the core day-to-day workflow. The last three start switched off — turn them on if and when you actually need them.

## How to enable and disable a module

1. Go to **Settings → General → Feature Modules**. Every logged-in user can see this list; only an Administrator can change it.
2. Find the module you want and click its switch.
   - **Turning one on** takes effect immediately, with a short confirmation message. If it's one of the modules that "needs setup" above, a small prompt appears straight after telling you what to configure next — you can go and do that right away, or click **Skip for now** and come back to it later from the same place.
   - **Turning one off** asks you to confirm first, since it changes what everyone else sees. Once confirmed, it's hidden from the menu straight away.
3. That's it — no restart, no page reload needed. Anyone else using Keep Track at the same time will see the change within about 30 seconds.

## What happens to your data when a module is disabled

**Nothing is deleted, ever.** Disabling a module only hides its page, its menu link, and its part of the dashboard. Every invoice, project, reconciliation record, or anything else you've already entered stays exactly as it was in the background.

Switch the module back on and everything reappears instantly — nothing needs to be "caught up" or rebuilt, because Keep Track never actually stopped keeping track of it. This is deliberate: a module toggle only ever changes what's *visible*, never what's *true*.

For example, if you turn Reconciliation off for a few months and then turn it back on, every reconciliation you'd already recorded is still there, and any reconciliation-related notifications that would have applied come straight back too.

## AI degradation — what works without AI

AI Extraction is a little different from the other modules, because Keep Track was already designed to work without AI in the first place — a missing or misconfigured AI provider has always meant "fill the fields in by hand," never "the app stops working."

- **With AI Extraction on and configured:** uploading an invoice reads the date, supplier, amount, category, and notes automatically. You still get a chance to check and correct everything before it's saved.
- **With AI Extraction switched off as a module**, or if it's on but hasn't been given an API key: every field on the review card is simply blank, and you fill it in yourself. Nothing about uploading, reviewing, confirming, signing, or reporting invoices stops working — the only thing missing is the automatic reading step.

So turning AI Extraction off (or leaving it unconfigured) is a genuine, supported way to use Keep Track — not a degraded or broken state. It's the right choice if you'd rather not send invoice content to an external AI provider at all.
