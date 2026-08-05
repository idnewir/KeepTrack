# Branding

## App Name

**Keep Track**

## Logo

A bar chart icon (three bars in ascending height, rightmost tallest) with a green tick badge overlaid on the top right — representing financial tracking (the bars) combined with confirmation/accuracy (the tick). Rendered inline as SVG (`frontend/src/components/Logo.jsx`), so it stays crisp at any size rather than scaling a raster asset. Used alongside a wordmark reading "**Keep Track**", where:

- "**Keep**" is set in the primary blue (`#2D6B9F`)
- "**Track**" is set in dark charcoal (`#2C2C2A`)
- Both words share a bold weight (`font-weight: 700`) at 20px, making the wordmark the strongest typographic element in the header

The logo icon and wordmark sit together as one tightly-spaced, vertically-centred unit (the header's clickable brand link, `frontend/src/components/Header.jsx`) — not as two loosely-related elements.

### Instance name

Each deployment can set its own instance name (e.g. "Stayton Road KHOC") via Settings → General. When set, it appears to the right of the wordmark, separated by a thin vertical divider line in the border colour, in the same size (20px) as the "Keep Track" wordmark but lighter weight (400 vs. the wordmark's 700) and mid-grey (`#5F5E5A`) — clearly secondary to the wordmark itself, never competing with it. If no instance name is configured, the header shows just "Keep Track" with no divider. On narrow (mobile) viewports the instance name is hidden to keep the header uncluttered; the logo and wordmark are unaffected.

## Colour Palette

| Role       | Name              | Hex       | Usage                                              |
|------------|-------------------|-----------|-----------------------------------------------------|
| Primary    | Teal-blue         | `#2D6B9F` | Navigation, primary buttons, links, "Keep" wordmark |
| Accent     | Green             | `#1D9E75` | Success states, positive figures, confirmation ticks |
| Background | Warm off-white    | `#F7F7F5` | Page background                                    |
| Text       | Dark charcoal     | `#2C2C2A` | Body text, headings, "Track" wordmark               |

## Dark Mode

Keep Track supports light, dark, and system (OS-following) themes, backed by CSS custom properties (`--kt-*`, defined in `frontend/src/styles/theme.css`) that every stylesheet reads from rather than hardcoded colours. `[data-theme='dark']`/`[data-theme='light']` on `<html>` gives an explicit override; a `prefers-color-scheme: dark` media query handles "system" (no attribute set) automatically, in both cases with no flash of the wrong theme on load (`frontend/index.html` sets the attribute synchronously before first paint).

| Role              | Light      | Dark       | Usage                                              |
|-------------------|------------|------------|-----------------------------------------------------|
| Primary           | `#2D6B9F`  | `#4D8BC9`  | Navigation, primary buttons, links, "Keep" wordmark, income chart line |
| Accent (green)    | `#1D9E75`  | `#1D9E75`  | Success states, positive figures, confirmation ticks — unchanged, already legible on dark |
| Amber             | `#A3690A` text / `#E6A020` fill | `#EF9F27` | Warnings, "near target"/"needs attention" states, notification banners |
| Danger (red)      | `#A83232`  | `#E8685E`  | Errors, destructive actions, "below target"/overdue states |
| Background        | `#F7F7F5`  | `#1A1A18`  | Page background                                     |
| Surface           | `#FFFFFF`  | `#2C2C2A`  | Cards, panels, inputs                               |
| Border            | `#E4E4E0`  | `#3D3D3A`  | Card borders, dividers, input borders               |
| Text (primary)    | `#2C2C2A`  | `#F0EFEB`  | Body text, headings, "Track" wordmark                |
| Text (secondary/muted) | `#6B6B67` / `#8A8A86` | `#A8A69E` | Subtitles, hints, table headers, timestamps |

A handful of elements are deliberately theme-invariant rather than following the palette above: the signing pad and PDF preview canvases always render on a fixed white background (the drawn signature ink is exported straight into the PDF, which is always white paper), the MFA QR code keeps a fixed white background for scannability, and the floating "Page X of Y" chip in the signing panel is a fixed light chip (it sits over the PDF page, not the app chrome).

### Toggle

A sun/moon/monitor icon button in the header (immediately left of the profile menu) cycles light → dark → system on each click, with a native tooltip naming the current state. The choice persists to `localStorage` (`keeptrack-theme`); "system" clears the override and follows the OS's `prefers-color-scheme` live, including if it changes while the app is open.

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
