# Decisions Log

A running record of significant design decisions, why they were made, and when. Newest first once the project is underway — initial decisions are listed together below as the project's starting baseline.

---

## Baseline decisions (project inception)

| Decision | Rationale |
|----------|-----------|
| **Financial year runs September to August** | Matches KHOC's (the first deployment's) financial year convention. Configurable per deployment, but this is the default. |
| **Target reserve uses a three-month rolling average** | Gives a simple, self-adjusting benchmark for a healthy balance without needing a manually maintained target figure. |
| **Signing workflow is toggleable** | Not every use case needs a signed audit trail (e.g. a personal budget tracker). Building it as an optional step keeps the app relevant to multiple use cases without forcing unnecessary steps on users who don't need it. |
| **MFA via authenticator app only — no email-based login** | Authenticator-app TOTP is more secure than email codes (no dependency on email account security or deliverability) and works offline. Keeps the auth surface simple. |
| **Responsive web app only — no native mobile app** | Avoids the cost and complexity of maintaining separate iOS/Android apps. A well-built responsive layout covers the mobile use case (checking the dashboard, uploading a photo of an invoice) without that overhead. |
| **Self-hosted on Proxmox/k3s, cloud-ready when needed** | Keeps hosting costs and data control in the user's hands initially, while the containerised architecture (Docker/docker-compose, k3s-deployable) means a move to a cloud Kubernetes service later is straightforward if needed. |
| **Logo: Option 2 — bar chart with green tick badge** | Chosen over alternative logo concepts as the clearest visual combination of "financial tracking" (bar chart) and "confirmed/accurate" (tick badge), reflecting the app's core value proposition. |
| **Colour scheme inspired by jw.org** | Chosen for its clean, calm, uncluttered aesthetic with generous whitespace — a good fit for a financial tool that should feel trustworthy and easy to read, not busy or overwhelming. |

---

*Future decisions should be appended below with a date, the decision, and the rationale, e.g.:*

```
## YYYY-MM-DD — Decision title
**Decision:** ...
**Rationale:** ...
```
