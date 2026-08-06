"""Escaping for user-controlled text placed inside a ReportLab `Paragraph`.

`Paragraph` parses its text as a small XML-like markup dialect (`<b>`,
`<font>`, `<img src="...">`, `<a href="...">`, ...) — `<img>` in particular
can reference an external URL, which ReportLab will fetch while rendering.
Any field a user controls that ends up in a generated PDF (invoice supplier
name, notes, a category or contribution group name, a report title, a
username, ...) must be escaped before being handed to `Paragraph`, or a
crafted value could inject markup, including triggering an outbound request
(SSRF) via a fake `<img>` tag, when someone later opens/generates that PDF.
"""
from xml.sax.saxutils import escape


def pdf_text(value) -> str:
    if value is None:
        return ""
    return escape(str(value))
