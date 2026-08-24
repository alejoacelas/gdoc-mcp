# Which Google Cloud project backs the 80,000 Hours gdoc connector?

Use `agent-cli-tools-alejandro` (project number `122477011422`). It is the only
organization-owned project already enrolled in the Google Workspace Developer Preview
Program, and the audit below found nothing that disqualifies it. Do not use
`mac-air-2020` (`1009200210134`): it is the personal project behind the
[personal test connector](personal-test.md), also preview-enrolled since 2026-08-19.

## Audited state (2026-08-24)

| Fact | Value | Evidence |
|---|---|---|
| Parent | organization `883222343127` = `80000hours.org` | `gcloud projects describe`, `gcloud organizations list` |
| Created | 2026-07-23 | `gcloud projects describe` |
| Project IAM | `roles/owner`: alejandro.acelas-contractor@80000hours.org, no other members | `gcloud projects get-iam-policy` |
| APIs | `docs`, `drive`, `sheets`, `docsmcp` enabled (`sheets` enabled during this audit) | `gcloud services list` |
| Developer Preview | Enrolled. Google registration email of 2026-07-29 names project number `122477011422`; a preview-only read (`commentsViewMode=COMMENTS_VIEW_MODE_INCLUDED`) through this project's Desktop client returned an open anchored comment and suggestion on 2026-08-24 | Registration email; live API call |
| Workspace API controls | Not currently blocking: the Workspace account granted and still refreshes full `drive`+`documents` to an unconfigured External Testing client (verified by a live read on 2026-08-24) | gdoc CLI token refresh |
| Existing OAuth clients | Desktop `122477011422-u53oov59531t86r8glse3ednhv0hlruf` (gdoc/docs-preview CLI) and Web `122477011422-8mm9dibmf4dcd96shrocovrf3mh956e1` (docs-mcp broker pilot, Vercel callbacks). Leave both unchanged; they serve live connectors | Credential files; docs-mcp pilot record |
| Consent-screen audience and branding | Not yet verified this audit; the deployment runbook that configured it specifies Internal | Console access unavailable from this session |

Developer Preview enrollment is per project number *and* per Workspace email. Every
staff member who will use preview features (anchored comments, suggestions) must be
registered through Google's add-member form while those APIs are Pre-GA. No other
per-email allowlisting is needed once the app audience is Internal: Internal apps have
no test-user list and no seven-day refresh expiry, Workspace API-controls configuration
is per client and organizational unit, and Claude Connect is a per-user click that no
administrator mediates.

## Remaining steps for an organization gdoc connector

Ordered; none are blocked on Anthropic.

1. Reserve the organization deployment first (Fly app and hostname, separate token
   store and `DATA_ENCRYPTION_KEY`, `ALLOWED_GOOGLE_DOMAIN=80000hours.org`). The
   callback URI must exist before the client that uses it.
2. Create a dedicated **Web application** OAuth client in `agent-cli-tools-alejandro`
   with exactly that callback. Do not reuse the personal Fly callback or either
   existing client.
3. Confirm the consent screen: Internal audience, current app name and support email,
   scopes `openid`, `userinfo.email`, `drive`, `documents`.
4. Add a second project administrator; a single owner is the current bus factor.
5. Ask the Workspace administrator to configure the new client in
   [Manage App Access](https://support.google.com/a/answer/7281227)
   (Security → Access and data control → API controls): search by the client ID,
   target the whole organization, choose **Specific Google data**, allow only the
   Drive and Docs scopes. Current policy does not block these scopes, so this is an
   auditable hardening step rather than an unblocking one.
6. A Claude Owner adds the connector under Organization settings → Connectors with
   Individual sign-in; each user Connects once.

The sibling Docs Preview MCP project documents the same rollout shape in more depth:
its approval matrix, runbook and one-member pilot live in the 80k repository under
`07-30-docs-mcp/docs/organization-owned-remote/`.
