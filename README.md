<!--ai-->
# gdoc MCP

Typed MCP tools backed by [Luca De Leo's `gdoc` CLI](https://github.com/LucaDeLeo/gdoc).
It follows [JP Addison's `dharma`](https://github.com/jpaddison3/dharma) pattern:
the MCP server validates tool inputs, runs the CLI without a shell, returns structured
output, and keeps an allowlisted escape hatch for new CLI features.

## Install and connect

Recipients do not need a terminal, Python, Node, `uv`, or a separate `gdoc` install:

1. Open the `.mcpb` built for the right Google profile and Mac architecture.
2. In Claude, ask: “Connect Google Docs using the gdoc tools.”
3. Claude calls `connect_google`; the bundle opens Google's authorization page.
4. Sign into Google and approve access once.

The bundle contains the CLI and the profile's Desktop OAuth client. Google stores no
password in the extension: the browser returns an authorization code, and `gdoc` saves
the resulting refresh token locally under `~/.config/gdoc/` with mode `0600`.

`connect_google` is separate from Claude's connector-level **Connect** button. That
button is available to remote MCP connectors; a local MCPB initiates OAuth from its own
tool.

## Private build profiles

OAuth client files identify their owning Google Cloud project and must not be committed
or attached to a public release. Build profile bundles locally:

```sh
npm ci

npm run build:mcpb -- personal \
  ~/.config/credentials/google-oauth-client-mac-air-2020-personal.json

npm run build:mcpb -- 80000hours \
  /path/to/80000hours-google-desktop-oauth-client.json
```

Outputs on an Apple Silicon Mac:

```text
dist/gdoc-personal-arm64.mcpb
dist/gdoc-80000hours-arm64.mcpb
```

The personal profile defaults to `alejoacelas@gmail.com`. The 80,000 Hours profile
leaves the account open for each employee and sends `80000hours.org` as Google's account
chooser hint. The organization OAuth application should use an Internal audience; that,
not the hint, enforces the Workspace domain.

The build fails before creating a bundle if the selected credential file is absent or
is not a Google Desktop OAuth client.

## Run from source

Developers can use an installed `gdoc` and any credential source it supports:

```sh
npm ci
GDOC_BIN=/absolute/path/to/gdoc npm start
```

The server exposes typed tools for browser authorization, reading, search, tabs,
revisions, comments, writes, edits, sharing, and document creation. `gdoc_cli` passes
arguments to an explicit subcommand allowlist without invoking a shell; auth, config,
update, and internal hooks cannot be reached through that raw tool.

## Test

```sh
npm test
```

Tests use a fake CLI: they do not open a browser or call Google. The profile build also
validates the manifest and packages a platform-native CLI. After unpacking a built
bundle, a smoke test should list tools and call `gdoc_cli` with `cat --help`; this proves
the server can find and execute the bundled binary without accessing Drive.

## Platform support

The current builds contain a PyInstaller CLI and are architecture-specific:

- `arm64`: Apple Silicon Macs;
- `x64`: Intel Macs when built on an Intel Mac;
- Windows is not built yet.

MCPB itself supports macOS and Windows. Windows support requires building a Windows
`gdoc.exe` on Windows and either publishing a separate bundle or adding runtime
OS/architecture selection to one multi-platform bundle.

## Security boundaries

- Profile OAuth clients are copied only into ignored local build artifacts.
- Refresh tokens are created by Google's browser flow; they are never committed or
  placed in the `.mcpb`.
- Model-provided values go to `execFile`, never a shell.
- The raw CLI tool excludes authentication and administrative commands.
- Temporary Markdown files used for writes are mode `0600` and removed after use.
- The bundled executable is unsigned, so a downloaded bundle may need Gatekeeper
  approval.

MIT.
<!--/ai-->
