# Test the personal remote connector

This test distinguishes Luca De Leo's `gdoc` tool surface from a connector that can
only create plain text. It exercises Markdown import, native structure, tabs, exact
edits, comments and round-trip reads.

## Run it

Connect `https://gdoc-mcp-alejo.fly.dev/mcp` in Claude Desktop and start a new chat
with the connector enabled. Paste the request below, replacing `<paste the exact JSON
fixture here>` with the complete contents of
[`fixtures/remote-connector-challenge.json`](fixtures/remote-connector-challenge.json).
The JSON fixture is derived from the readable
[`remote-connector-challenge.md`](fixtures/remote-connector-challenge.md); its escaped
double newlines stop Claude from removing Markdown-significant blank lines before the
tool call.

```text
Using only the gdoc connector:

1. Call create_document with the exact JSON object below. Copy its content string
   byte-for-byte; do not reconstruct, simplify, or normalize it.
2. Add a tab named "Verification".
3. In that tab, insert a heading "Verification log" followed by three bullets:
   "Created remotely", "Read back successfully", and "Exact edit succeeded".
   Set force=true for this insertion because you just changed the same document by
   adding the tab.
4. In the first tab's table, change the Status beside "Native table" from
   "Pending" to "Passed" by addressing the table cell, not by replacing every
   occurrence of the word Pending.
5. Add a comment anchored to the exact phrase
   "ORCHID-WREN-7429 crosses the blue bridge" saying
   "Remote MCP anchor test". Tell me whether gdoc reports it as genuinely anchored
   or as its unanchored fallback.
6. Reply to that comment with "Remote MCP reply test".
7. Read all tabs back, then list the comments separately. Return the document URL, tab
   names, comment ID, anchoring result, and a short pass/fail table for every check
   above. Do not resolve or delete anything.

CREATE_DOCUMENT JSON STARTS
<paste the exact JSON fixture here>
CREATE_DOCUMENT JSON ENDS
```

## Pass conditions

- The first tab has real headings, nested lists, a blockquote, a native table, inline
  styles, a clickable link, a fenced-code treatment and intact Unicode.
- `Verification` is a separate Google Docs tab, not another heading in the first tab.
- Only the `Native table` status changes to `Passed`.
- The comment and reply appear in one thread. Anchoring may report `false` unless the
  Google Cloud project is enrolled in the Workspace Developer Preview Program; that is
  a known API boundary, not a transport failure.
- Reading all tabs returns both sentinels and the exact unique anchor phrase.

If the table becomes inline pipe-delimited text, inspect Claude's `create_document`
request. The content must contain `remains exact.\n\n| Check`; a single newline makes
the Markdown parser treat the table as part of the preceding list item.

The native Google Drive connector is not an equivalent control: this test must invoke
the custom gdoc tools for creation, tab handling, cell editing and comments.
