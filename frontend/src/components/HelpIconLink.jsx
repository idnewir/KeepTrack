import { Link } from 'react-router-dom'

// Small, subtle "?" link placed in a page's header area, deep-linking into
// the matching Help topic (see help/topics.js for the topic keys).
export default function HelpIconLink({ topic }) {
  return (
    <Link
      to={`/help?topic=${topic}`}
      className="kt-help-quick-link"
      aria-label="Open help for this page"
      title="Help"
    >
      ?
    </Link>
  )
}
