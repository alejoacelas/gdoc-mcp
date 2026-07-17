<!--ai-->
# gdoc MCP

Typed MCP tools backed by [Luca De Leo's `gdoc` CLI](https://github.com/LucaDeLeo/gdoc).
It follows [JP Addison's `dharma`](https://github.com/jpaddison3/dharma) pattern:
the MCP server validates tool inputs, runs the CLI without a shell, returns structured
output, and keeps an allowlisted escape hatch for new CLI features.

## Chosen deployment

Use the hosted MCP connector for 80,000 Hours. A Claude owner adds one URL; each staff
member clicks **Connect** and authorizes their own Google account. This is the only
option that gives staff the same connector-level experience as native Drive.

The local MCPB remains a fallback for development, personal use, or environments where
hosting Google refresh tokens is unacceptable. It is not the planned staff deployment.

## Local fallback

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

## Remote connector

Follow [the personal end-to-end test guide](docs/personal-test.md) to configure Google
Cloud, install the Web OAuth credential without exposing it, add the connector to
Claude, and verify read and write calls.

The remote service gives Claude Team users the native connector flow: an owner adds
`https://gdoc-mcp-alejo.fly.dev/mcp` once, then each user clicks **Connect** and grants
Google access. The deployed endpoint is healthy, but its current personal Desktop OAuth
credential cannot accept a hosted callback. Before testing Connect, create a Google
OAuth client of type **Web application** with this authorized redirect URI:

```text
https://gdoc-mcp-alejo.fly.dev/oauth/google/callback
```

Then replace the two staged Fly secrets and redeploy:

```sh
flyctl secrets set --app gdoc-mcp-alejo \
  GOOGLE_CLIENT_ID='<web-client-id>' \
  GOOGLE_CLIENT_SECRET='<web-client-secret>'

flyctl deploy --app gdoc-mcp-alejo --remote-only
```

For 80,000 Hours, deploy a separate organization-owned instance, set
`ALLOWED_GOOGLE_DOMAIN=80000hours.org`, and use an Internal Web OAuth client owned by
the Workspace organization. Keeping personal and organizational deployments separate
prevents a credential switch from invalidating another profile's stored grants.

The service implements MCP dynamic client registration, S256 PKCE, OAuth resource
indicators, Google identity verification, one-hour MCP access tokens, MCP refresh
tokens, and per-user MCP sessions. Google refresh tokens and MCP credentials are stored
in one AES-256-GCM encrypted file on an encrypted persistent volume. The encryption key
is a deployment secret. A Google token is materialized in a mode-`0600` temporary home
directory only while `gdoc` handles a request, then removed.

The current encrypted file store requires one running machine. Before adding replicas,
replace it with a transactional shared database or add cross-process locking.

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

The live deployment can be checked without Google credentials:

```sh
curl -fsS https://gdoc-mcp-alejo.fly.dev/health
curl -fsS https://gdoc-mcp-alejo.fly.dev/.well-known/oauth-protected-resource/mcp
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
- Remote Google grants and MCP credentials are encrypted at rest; OAuth state and PKCE
  bind each browser callback to the initiating Claude connection.
- The bundled executable is unsigned, so a downloaded bundle may need Gatekeeper
  approval.

MIT.
<!--/ai-->
