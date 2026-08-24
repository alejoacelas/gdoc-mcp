# What does a gdoc MCP update require?

Most hosted-connector updates require no user action. We update the pinned `gdoc`
version, expose and test the tool, and deploy Fly. Users keep their connector and
Google grant.

## Why can upstream and the hosted connector differ?

They are separate MCP implementations around the same CLI:

- Upstream [`gdoc mcp`](https://github.com/LucaDeLeo/gdoc/pull/44) is a local stdio
  server. It derives tool schemas from `gdoc`'s argument parser, so a flag added to an
  exposed command appears automatically.
- This repository's hosted server uses Streamable HTTP and adds per-user Google OAuth,
  encrypted token storage, and remote MCP sessions. Its named tools and raw-command
  allowlist are hand-written so their schemas stay small and risky commands remain
  unreachable.

That manual boundary omitted `structure`, although upstream's MCP exposes it. The raw
`gdoc_cli` fallback also cannot call it because `structure` is absent from our command
allowlist. This is a maintenance gap, not an authentication limitation.

## Change ladder

The table assumes the connector URL, Google OAuth client ID, requested scopes, token
store, and encryption key stay unchanged.

| Change | Work for us | Action for an existing user |
|---|---|---|
| `gdoc` bug fix or changed behavior behind an existing tool | Review upstream; update the Docker commit pin; test; deploy | None. Retry after a transient deployment error. |
| New flag on a command already in the raw allowlist | Update the pin. Add it to the named tool when it is useful enough for Claude to discover; test; deploy | None. Start a new conversation if an existing one retains the old tool schema. |
| New `gdoc` command | Update the pin; security-review it; add it to the raw allowlist and usually add a named tool; test; deploy | None. Start a new conversation to see the new tool. |
| New Docs/Drive feature using the current `drive` or `documents` scope | Implement or update `gdoc`; expose it; test against an enrolled project; deploy | No login. Claude may ask for approval before invoking a new write tool. |
| Enable another Google API under an existing OAuth scope | Enable it in the Cloud project; deploy supporting code | None. |
| Request an additional Google OAuth scope | Configure the consent screen; update the server's scope list; deploy | Disconnect and **Connect** once to grant the new permission. No connector reinstall. |
| Rotate the secret for the same Google OAuth client ID | Change the Fly secret and verify refresh-token exchange | Normally none; reconnect only if Google returns `invalid_grant`. |
| Replace the Google OAuth client ID or Cloud project | Configure the callback and replace the Fly credentials | Every user must Connect again; grants belong to the old client ID. |
| Preserve the encrypted token store while changing its format or database | Back up; migrate; deploy; verify refresh | None if the migration preserves every Google and MCP refresh token. |
| Lose the token store or change `DATA_ENCRYPTION_KEY` without migrating it | Restore the matching data and key, or start a new store | Every user must Connect again. |
| Keep the public URL but replace or restart Fly machines | Deploy with a health check and retain the volume | None; active requests may need one retry. |
| Change the connector's public URL or OAuth issuer | Deploy the new endpoint and callback; update the Claude connector | An owner removes and re-adds the custom connector; users Connect again. Anthropic currently requires removal and re-addition to change connector details. |
| Update the local `.mcpb` fallback | Rebuild, sign if applicable, and distribute a new architecture-specific bundle | Install the new bundle and restart Claude Desktop. Google login is retained if the OAuth client/profile and `~/.config/gdoc` token path stay unchanged. |

Suggested-edit writing is the ordinary case: it uses the `documents` scope users have
already granted. We would implement it in `gdoc`, update the pin and wrapper, test, and
deploy. Users would not reinstall or sign into Google again; a new conversation may be
needed for Claude to load the new tool.

The personal Google OAuth app is still in **Testing**. Because it requests Docs/Drive
scopes, its Google refresh grants expire after seven days. Reconnecting weekly is a
property of that test app, not of gdoc deployments. An Internal 80,000 Hours app, or a
verified External production app, removes that test-mode friction.

## Routine hosted release

A compatible upstream change should take about 15–45 minutes; a new named tool with
tests and a live write check should take about 1–3 hours. The release path is:

1. Review the upstream diff and pin an immutable commit in `Dockerfile`.
2. Compare upstream's MCP command list and parser fields with our named tools and raw
   allowlist.
3. Add or update the named tool, keeping local-file and administrative commands out.
4. Run `npm test`, build the container, and test the affected command with a disposable
   document.
5. Deploy Fly; check `/health`, OAuth metadata, tool discovery, and one authenticated
   call.
6. Update the relevant guide, commit, and push.

We should add a CI drift check that reports upstream commands missing from our wrapper.
It should fail for review, not expose commands automatically: new commands can delete,
share, export, or access local paths, so adding them remains an explicit decision.

## Practical rule

- **Code or tool change:** deploy once; users do nothing beyond opening a new chat if
  needed.
- **New write tool:** no login; users may approve that tool's action.
- **New Google scope or OAuth identity:** users Connect again.
- **New connector URL:** owner re-adds it, then users Connect again.
- **Local MCPB change:** users install the rebuilt bundle; Google login usually remains.

Anthropic's current [custom-connector guide](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)
documents per-user Connect, remote execution, and removal/re-addition when connector
details change. Google's [OAuth consent guide](https://developers.google.com/workspace/guides/configure-oauth-consent)
documents test users, publishing status, and scope configuration.
