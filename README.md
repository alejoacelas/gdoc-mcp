<!--ai-->
# gdoc MCP

Typed MCP tools backed by [Luca De Leo's `gdoc` CLI](https://github.com/LucaDeLeo/gdoc).
It follows [JP Addison's `dharma`](https://github.com/jpaddison3/dharma) pattern:
the MCP server validates tool inputs, runs the CLI without a shell, returns its structured
output, and keeps a raw allowlisted escape hatch for new CLI features.

## Run

Install and authenticate the CLI first:

```sh
uv tool install git+https://github.com/LucaDeLeo/gdoc.git
gdoc auth
```

Then install and start the server:

```sh
npm ci
npm start
```

Set `GDOC_BIN=/absolute/path/to/gdoc` when `gdoc` is not on the MCP host's `PATH`.
The server exposes typed tools for reading, search, tabs, revisions, comments, writes,
edits, sharing, and document creation. `gdoc_cli` passes arguments to an explicit
subcommand allowlist without invoking a shell; auth, config, update, and internal hook
commands are excluded.

## Test

```sh
npm test
node mcpb/smoke.mjs
```

The smoke test uses the account already authenticated by `gdoc` and makes one live Drive
list call.

## Desktop extension

```sh
npm run build:mcpb
```

This builds `dist/gdoc-arm64.mcpb` or `dist/gdoc-x64.mcpb` for the current Mac. The
extension bundles a PyInstaller copy of the CLI and reuses the user's existing
`~/.config/gdoc` OAuth credentials and tokens. Recipients must authenticate once with
`gdoc auth` before using the extension. The generated binary is unsigned, so a downloaded
bundle may require Gatekeeper approval.

## Design limits

- The server deliberately does not expose `gdoc auth`: browser OAuth belongs in a user-run
  setup step, not an agent tool.
- MCP tool output stays JSON, with CLI notices appended after a `[gdoc notice]` marker.
- The desktop build is architecture-specific because PyInstaller cannot make one universal
  executable from Python extension modules.

MIT.
<!--/ai-->
