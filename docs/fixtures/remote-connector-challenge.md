# Remote gdoc MCP round-trip

This document tests **bold**, *italic*, ***bold italic***, ~~strikethrough~~,
`inline code`, and a [link to the gdoc repository](https://github.com/LucaDeLeo/gdoc).

> A useful connector should preserve structure, not merely copy visible characters.
> This blockquote contains **formatting**, “smart quotes,” and an em dash — all at once.

## Decision record

1. Preserve the source hierarchy.
2. Create native Google Docs elements.
   1. Keep nested numbering nested.
   2. Keep links clickable.
3. Return enough structure to edit the result safely.

### Acceptance criteria

- Headings appear in the document outline.
  - This is a nested bullet.
    - This is a third-level bullet with Unicode: café, naïve, 日本語, and 🧪.
- The table below is a native three-column table.
- The unique phrase **ORCHID-WREN-7429 crosses the blue bridge** remains exact.

| Check | Expected result | Status |
|---|---|---|
| Heading hierarchy | Visible in the document outline | Pending |
| Inline styles | Bold, italic, strike, code, and link survive | Pending |
| Native table | Three columns and four body rows | Pending |
| Unicode | Accents, CJK, emoji, smart quotes, and em dash survive | Pending |

## Literal material

The code block must remain visually distinct and must not become a command:

```text
if status == "Pending":
    preserve("<angle-brackets>", "ampersand &", "emoji 🧪")
```

---

Final sentinel: `GDOC-REMOTE-END-2026-08-21`
