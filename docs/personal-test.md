# How do I test the hosted gdoc connector with my personal Google account?

Use the personal Google Cloud project only for this test. The eventual 80,000 Hours
connector should have a separate organization-owned project, deployment, and token
store.

## What is already running?

- MCP URL: `https://gdoc-mcp-alejo.fly.dev/mcp`
- Google callback: `https://gdoc-mcp-alejo.fly.dev/oauth/google/callback`
- Fly app: `gdoc-mcp-alejo`
- Suggested existing personal project: `mac-air-2020`

The server is deployed and healthy. It needs a Google OAuth client of type **Web
application** before the Connect flow can finish. The existing Desktop OAuth client is
for the local MCPB and cannot receive this hosted callback.

## 1. Configure the personal Google Cloud project

Select project `mac-air-2020` in the [Google Cloud Console](https://console.cloud.google.com/).
Using a separate test project is also fine; Google recommends separating testing and
production projects.

Enable these APIs in **APIs & Services → Library**:

- Google Drive API
- Google Docs API
- Google Sheets API

Google's current [Workspace API guide](https://developers.google.com/workspace/guides/enable-apis)
links directly to each API and explains the same process.

## 2. Configure Google Auth Platform

Open **Google Auth Platform → Branding**. If the platform is not configured, click
**Get started** and enter:

- App name: `gdoc MCP personal test`
- User support email: your personal Google email
- Audience: **External**
- Developer contact email: your personal Google email

Keep the publishing status at **Testing**. Under **Audience → Test users**, add the
personal Google account you will use during Connect.

Under **Data Access**, add:

- `openid`
- `https://www.googleapis.com/auth/userinfo.email`
- `https://www.googleapis.com/auth/drive`
- `https://www.googleapis.com/auth/documents`

The broad Drive scope is necessary for the current `gdoc` feature set, including file
search, comments, revisions, sharing, and creation. Google may show an unverified-app
warning during this personal test. External apps in Testing status issue refresh tokens
that expire after seven days when they request Drive or Docs access, so reconnect after
a week if the test starts returning authentication errors.

Google documents the current screens and test-user behavior in its
[OAuth consent guide](https://developers.google.com/workspace/guides/configure-oauth-consent).

## 3. Create the Web OAuth client

Open **Google Auth Platform → Clients**, then:

1. Click **Create Client**.
2. Choose **Web application**.
3. Name it `gdoc remote MCP personal test`.
4. Leave **Authorized JavaScript origins** empty.
5. Add this exact **Authorized redirect URI**:

   ```text
   https://gdoc-mcp-alejo.fly.dev/oauth/google/callback
   ```

6. Click **Create**, then download the JSON file.

Google's [credential guide](https://developers.google.com/workspace/guides/create-credentials#web)
describes the Web application client and redirect URI fields.

## 4. Store and install the credential

Move the downloaded JSON to this private, untracked path:

```text
~/.config/credentials/google-oauth-client-gdoc-remote-personal.json
```

Restrict it to your user account, then run the installer:

```sh
chmod 600 ~/.config/credentials/google-oauth-client-gdoc-remote-personal.json

cd /Users/alejo/best/work/tools/gdoc/mcp
scripts/configure-remote-google.sh \
  ~/.config/credentials/google-oauth-client-gdoc-remote-personal.json
```

The script verifies that the file contains a Web client with the exact callback, reads
the client ID and secret, and sends them through `flyctl secrets import`. It does not
print either value or copy the JSON into the repository or container. Fly encrypts the
deployment secrets and restarts the existing machine.

## 5. Connect it in Claude

For an individual Claude plan:

1. Open **Customize → Connectors**.
2. Click **+ → Add custom connector**.
3. Name it `gdoc personal test`.
4. Enter `https://gdoc-mcp-alejo.fly.dev/mcp`.
5. Leave the advanced OAuth client ID and secret fields empty. The MCP endpoint supports
   dynamic client registration.
6. Add the connector, then click **Connect**.
7. Choose the personal Google account you added as a test user and approve access.

For Team or Enterprise, an Owner instead adds it under **Organization settings →
Connectors → Add → Custom → Web**; the remaining Connect flow is per user. Anthropic's
[remote connector guide](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)
documents both paths.

## 6. Test the complete path

Start with read-only calls:

1. “Using gdoc, list my five most recently modified Google Docs.”
2. “Read this document and give me its title: `<Google Doc URL>`.”
3. “List the tabs in this document: `<Google Doc URL>`.”

Then test a reversible write:

1. Create a blank document named `gdoc MCP personal test`.
2. Write one sentence into it.
3. Read it back and confirm the sentence.
4. Delete the test document yourself in Drive when finished; the MCP deliberately has
   no delete tool.

## Troubleshooting

- `redirect_uri_mismatch`: the credential is not a Web client or its redirect URI does
  not exactly match the callback above.
- `access_denied` or “app not configured”: confirm the audience is External, publishing
  status is Testing, and your exact Google account is a test user.
- `API has not been used` or `SERVICE_DISABLED`: enable Drive, Docs, and Sheets in the
  same project that owns the Web client.
- Authentication fails after seven days: reconnect; this is Google's Testing-mode
  refresh-token lifetime, not the MCP access-token lifetime.
- Connector cannot be added: use the `/mcp` URL, not the callback or health URL.
- Server diagnosis: run `flyctl logs --app gdoc-mcp-alejo`; logs intentionally omit
  Google and MCP token values.
