// Runs before first paint so an explicit light/dark override applies
// immediately, instead of flashing the wrong theme until React mounts and
// ThemeContext runs. 'system'/missing leaves data-theme unset — theme.css's
// prefers-color-scheme media query already handles that case with no JS
// needed, so there's nothing to set here.
//
// Kept as its own file (rather than an inline <script> in index.html) so
// index.html's Content-Security-Policy doesn't need a script-src
// 'unsafe-inline' allowance just for this one snippet.
(function () {
  try {
    var stored = window.localStorage.getItem('keeptrack-theme')
    if (stored === 'light' || stored === 'dark') {
      document.documentElement.setAttribute('data-theme', stored)
    }
  } catch (e) {}
})()
