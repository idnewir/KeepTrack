# Getting Started

Welcome to Keep Track! This guide will help you log in for the first time and find your way around.

## 1. Opening Keep Track

Keep Track works in your web browser — there is nothing to install on your phone or computer.

1. Open any web browser (Chrome, Safari, Edge, Firefox).
2. Type in the web address given to you by your Keep Track administrator.
3. You will see the login screen.

## 2. Logging in

You will need three things to log in:

1. Your **username**.
2. Your **password**.
3. A **code from an authenticator app** on your phone (this is called MFA, or multi-factor authentication — it's an extra layer of security).

If you don't have an authenticator app yet, download **Google Authenticator** or **Authy** from your phone's app store. Your administrator will show you a QR code to scan when your account is set up — this links the app to your Keep Track account.

## 3. If you're brand new

If nobody has an account yet (this is a brand-new Keep Track installation), the login screen shows a banner: **"Welcome to Keep Track. No accounts exist yet."** Click **Set up Keep Track** on that banner to start a short **setup wizard** — whoever completes it becomes the first Administrator. Once the wizard finishes, you're sent back to the login screen to sign in properly with your new account (including the MFA step below).

After scanning the QR code, you'll be asked **"When did you start using Keep Track?"** — pick the month you're starting to use it, or choose **Skip for now**. This is optional but useful: any month before the date you choose is hidden across the whole app, so you don't see empty rows and zero values for months before you actually started tracking anything (handy if your financial year began earlier than when you set Keep Track up). The same step also asks **"When does your financial year start?"** — pick the month your organisation's (or your own) financial year begins; September is pre-selected since that's common for UK charities, but pick whatever fits.

The last step, **"Configure AI features (optional)"**, sets up the AI provider that reads uploaded invoices automatically and writes report summaries — pick Anthropic, OpenAI, or a self-hosted model (Ollama), and optionally enter an API key. This is also entirely optional: click **Skip for now** and configure it later, or leave AI switched off altogether — Keep Track works perfectly well without it, you'll just fill in invoice details by hand (see [Feature Modules](feature-modules.md#ai-degradation--what-works-without-ai)).

All three settings — app start date, financial year start month, and AI configuration — can be changed at any time afterwards from **Settings** (see the [Settings Guide](settings-guide.md)).

If an account already exists, click **Register** on the login screen, fill in your details, and set up your authenticator app. Your request will then be **pending** until an Administrator approves you and gives you a role.

## 3a. Your first login: the welcome overlay

The first time you log in, a **welcome card** appears over the dashboard with a short greeting and four quick-start shortcuts (upload your first invoice, record income, view the dashboard, run a report). Click any of them to jump straight there, or **Get started** / **Don't show this again** to dismiss it — either way, it only appears once. You can always find the same help content again later from the **Help** link in the sidebar.

## 4. Finding your way around

Once logged in, you'll see:

- A **sidebar** on the left (or a menu button on mobile) with links to: Dashboard, Invoices, Contributions, Reconciliation, Projects, Reports, and Settings. If your Administrator has switched on the optional [Budget Planning](budget-planning.md) and/or [Debt Tracking](debt-tracking.md) modules, **Budget Planning** and/or **Debts** links also appear, between Reports and Settings.
- A **header** at the top showing the Keep Track logo and name.
- The **main area** in the middle, which shows whichever page you've selected.

## 5. What you can do depends on your role

Not everyone sees the same options. For example, some people can only view information, while others can also add and change things. If a button or page seems to be missing, it's likely your role doesn't include that permission — ask your administrator if you think this is wrong.

## 6. Setting a profile picture

From **My profile** (click your name in the top-right corner, then **My profile**), you can add a picture next to your name in two ways:

- **Upload image** — upload a JPG, PNG, GIF, or WebP file directly (max 5 MB).
- **Gravatar** — enter the email address linked to your [Gravatar](https://www.gravatar.com) account and click **Fetch from Gravatar**.

Either way, if you set neither, your initials are shown instead.

A Gravatar picture is downloaded once and **saved to Keep Track**, not loaded live from Gravatar on every page view — this keeps things fast and doesn't depend on Gravatar's own website being reachable. If you update your picture on Gravatar's website afterwards, Keep Track won't notice on its own: go back to **My profile → Gravatar** and click **Refresh from Gravatar** to pick up the change.

The same **My profile** page also lets you save a **signature** to reuse every time you sign an invoice, instead of drawing it fresh each time — see [Reviewing and Signing](reviewing-and-signing.md) for how it's used.

## 7. Optional: tracking your own debts

If you're using Keep Track for your own or your household's finances,
Keep Track also has an optional **Debt Tracking** module — off by default —
for logging loans, credit cards, mortgages, and similar, recording
payments, and seeing a calculated payoff timeline for each one. An
Administrator turns it on from **Settings → General → Feature Modules**;
doing so also switches the Dashboard to a Personal Finance view showing
your net worth and debt at a glance. See the [Debt Tracking](debt-tracking.md)
guide for the full walkthrough.

## 7a. Optional: budgets and savings goals

Also off by default, the **Budget Planning** module lets you set an annual
budget per category, see actual spend tracked against it with clear
traffic-light warnings, and set savings goals with progress tracking. An
Administrator turns it on the same way, from **Settings → General →
Feature Modules**. See the [Budget Planning](budget-planning.md) guide for
the full walkthrough.

## 7b. Optional: picking up invoices from a shared folder

A third optional module, **Folder Integration**, lets Keep Track watch a shared network folder and automatically import any invoice saved there — and automatically save signed PDFs back out to a folder too, once they're signed. Unlike Debt Tracking and Budget Planning, it doesn't add a page of its own; an Administrator turns it on from **Settings → General → Feature Modules** and configures it from **Settings → Data → Folder Integration**. See the [Folder Integration](folder-integration.md) guide for the full setup.

## 8. Where to go next

- To upload your first invoice, see [Uploading Invoices](uploading-invoices.md).
- To understand the dashboard, see [Dashboard Guide](dashboard-guide.md).
- To record money coming in, see [Managing Contributions](managing-contributions.md).
- To track your own debts, see [Debt Tracking](debt-tracking.md).
- To set budgets and savings goals, see [Budget Planning](budget-planning.md).
- To pick up invoices automatically from a shared folder, see [Folder Integration](folder-integration.md).

## Related guides

- [Uploading Invoices](uploading-invoices.md) — adding your first invoice.
- [Dashboard Guide](dashboard-guide.md) — understanding what you see after logging in.
- [Settings Guide](settings-guide.md) — every setting mentioned in this guide, in full detail.
- [Feature Modules](feature-modules.md) — the full picture of what modules are and how they work.
