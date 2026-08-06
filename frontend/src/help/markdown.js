import { Marked } from 'marked'

// A dedicated Marked instance (rather than the module-level default) so its
// custom link renderer doesn't leak into any other use of marked elsewhere
// in the app.
const marked = new Marked({
  renderer: {
    link(token) {
      const { href, title, tokens } = token
      const text = this.parser.parseInline(tokens)
      const isExternal = /^https?:\/\//i.test(href || '')
      const titleAttr = title ? ` title="${title}"` : ''
      // Internal links (e.g. "uploading-invoices.md", used for cross-links
      // between guides) stay plain — HelpPage intercepts clicks on them
      // itself to route within the app rather than requesting the raw file.
      const externalAttrs = isExternal ? ' target="_blank" rel="noopener noreferrer"' : ''
      return `<a href="${href}"${titleAttr}${externalAttrs}>${text}</a>`
    },
  },
})

export function renderGuideMarkdown(markdownText) {
  return marked.parse(markdownText ?? '')
}
