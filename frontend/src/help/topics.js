// Shared list of help topics — the left-panel nav in HelpPage, and every
// quick-help icon elsewhere in the app, both key off this one array so a
// topic only has to be defined in one place.
export const HELP_TOPICS = [
  { key: 'getting-started', label: 'Getting Started', file: 'getting-started.md' },
  { key: 'uploading-invoices', label: 'Uploading Invoices', file: 'uploading-invoices.md' },
  { key: 'reviewing-and-signing', label: 'Reviewing & Signing', file: 'reviewing-and-signing.md' },
  { key: 'dashboard-guide', label: 'Dashboard Guide', file: 'dashboard-guide.md' },
  { key: 'managing-contributions', label: 'Managing Income', file: 'managing-contributions.md' },
  { key: 'reconciliation-guide', label: 'Reconciliation', file: 'reconciliation-guide.md' },
  { key: 'reports-guide', label: 'Reports', file: 'reports-guide.md' },
  { key: 'settings-guide', label: 'Settings Guide', file: 'settings-guide.md' },
]

export const DEFAULT_HELP_TOPIC = 'getting-started'

export const HELP_TOPIC_BY_KEY = Object.fromEntries(HELP_TOPICS.map((t) => [t.key, t]))

// Maps a guide's own filename (e.g. "uploading-invoices.md", as used in
// cross-links between guides like getting-started.md's "See Uploading
// Invoices") back to its topic key, so clicking one of those links inside
// rendered content can navigate within the app instead of requesting the
// raw .md file.
export const HELP_TOPIC_BY_FILE = Object.fromEntries(HELP_TOPICS.map((t) => [t.file, t.key]))
