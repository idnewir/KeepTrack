# Branding

## App Name

**Keep Track**

## Logo

A bar chart icon (three bars in ascending height, rightmost tallest) with a green tick badge overlaid on the top right — representing financial tracking (the bars) combined with confirmation/accuracy (the tick). Rendered inline as SVG (`frontend/src/components/Logo.jsx`), so it stays crisp at any size rather than scaling a raster asset. Used alongside a wordmark reading "**Keep Track**", where:

- "**Keep**" is set in the primary blue (`#2D6B9F`)
- "**Track**" is set in dark charcoal (`#2C2C2A`)

The logo icon and wordmark sit together as one tightly-spaced, vertically-centred unit (the header's clickable brand link, `frontend/src/components/Header.jsx`) — not as two loosely-related elements.

### Instance name

Each deployment can set its own instance name (e.g. "Stayton Road KHOC") via Settings → terminology. When set, it appears to the right of the wordmark, separated by a thin vertical divider line in the border colour, in a smaller (14px), medium-weight, mid-grey (`#5F5E5A`) typeface — clearly secondary to the "Keep Track" wordmark itself, never competing with it. If no instance name is configured, the header shows just "Keep Track" with no divider. On narrow (mobile) viewports the instance name is hidden to keep the header uncluttered; the logo and wordmark are unaffected.

## Colour Palette

| Role       | Name              | Hex       | Usage                                              |
|------------|-------------------|-----------|-----------------------------------------------------|
| Primary    | Teal-blue         | `#2D6B9F` | Navigation, primary buttons, links, "Keep" wordmark |
| Accent     | Green             | `#1D9E75` | Success states, positive figures, confirmation ticks |
| Background | Warm off-white    | `#F7F7F5` | Page background                                    |
| Text       | Dark charcoal     | `#2C2C2A` | Body text, headings, "Track" wordmark               |

## Design Inspiration

Visual design takes cues from **jw.org**: clean, uncluttered layouts, a calm and unhurried feel, and generous whitespace. Interfaces should avoid visual noise — favour plenty of breathing room over dense, cramped layouts, and let colour be used purposefully (status, emphasis) rather than decoratively.

## Typography

System sans-serif stack (no custom web fonts to load) — e.g.

```
-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif
```

This keeps the app fast-loading and native-feeling on every platform.

## Mobile Approach

Keep Track is a **responsive web app** — there is no native iOS/Android app. Users on mobile simply open a browser and navigate to the server's URL; the layout adapts to smaller screens (collapsible sidebar, stacked panels, touch-friendly controls).
