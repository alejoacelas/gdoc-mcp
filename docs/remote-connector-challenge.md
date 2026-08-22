# Test the personal remote connector

This test distinguishes Luca De Leo's `gdoc` tool surface from a connector that can
only create plain text. It exercises Markdown import, native structure, tabs, exact
edits, comments and round-trip reads.

## Run it

Connect `https://gdoc-mcp-alejo.fly.dev/mcp` in Claude Desktop, start a new chat with
the connector enabled, paste the contents of
[`fixtures/remote-connector-challenge.md`](fixtures/remote-connector-challenge.md),
then add this request:

```text
Using only the gdoc connector:

1. Create a pageless Google Doc titled "Remote gdoc MCP round-trip — 2026-08-21"
   from the Markdown below. Do not simplify or rewrite it.
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

MARKDOWN STARTS
<paste the fixture here>
MARKDOWN ENDS
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

The native Google Drive connector is not an equivalent control: this test must invoke
the custom gdoc tools for creation, tab handling, cell editing and comments.
