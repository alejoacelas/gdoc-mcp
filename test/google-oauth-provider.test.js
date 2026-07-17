import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { EncryptedStore } from "../server/encrypted-store.js";
import { GoogleOAuthProvider } from "../server/google-oauth-provider.js";

test("GoogleOAuthProvider keeps Google grants behind separate MCP tokens", async () => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "gdoc-oauth-test-"));
  const store = new EncryptedStore(path.join(dir, "state.enc"), Buffer.alloc(32, 9).toString("base64"));
  const provider = new GoogleOAuthProvider({
    store,
    publicUrl: "https://mcp.example.test",
    googleClientId: "google-client",
    googleClientSecret: "google-secret",
  });
  const client = {
    client_id: "claude-client",
    client_id_issued_at: 1,
    redirect_uris: ["https://claude.example/callback"],
    token_endpoint_auth_method: "none",
  };
  const params = {
    state: "claude-state",
    scopes: ["mcp:tools"],
    codeChallenge: "challenge",
    redirectUri: client.redirect_uris[0],
    resource: new URL("https://mcp.example.test/mcp"),
  };
  let googleRedirect;
  await provider.authorize(client, params, { redirect: (url) => { googleRedirect = new URL(url); } });
  const state = googleRedirect.searchParams.get("state");
  const nonce = googleRedirect.searchParams.get("nonce");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).startsWith("https://oauth2.googleapis.com/tokeninfo")) {
      return new Response(JSON.stringify({ aud: "google-client", email_verified: "true", nonce, sub: "google-user", email: "user@example.test" }), { status: 200 });
    }
    return new Response(JSON.stringify({ refresh_token: "google-refresh", id_token: "google-id-token" }), { status: 200 });
  };
  try {
    let claudeRedirect;
    await provider.handleGoogleCallback({ code: "google-code", state }, {
      redirect: (url) => { claudeRedirect = new URL(url); },
      status: () => ({ send: (message) => { throw new Error(message); } }),
    });
    const code = claudeRedirect.searchParams.get("code");
    assert.equal(claudeRedirect.searchParams.get("state"), "claude-state");
    assert.equal(await provider.challengeForAuthorizationCode(client, code), "challenge");
    const issued = await provider.exchangeAuthorizationCode(client, code, undefined, client.redirect_uris[0], params.resource);
    assert.notEqual(issued.access_token, "google-refresh");
    assert.notEqual(issued.refresh_token, "google-refresh");
    assert.equal((await provider.verifyAccessToken(issued.access_token)).extra.userId, "google-user");
    assert.equal((await provider.googleCredentials("google-user")).refresh_token, "google-refresh");
  } finally {
    globalThis.fetch = originalFetch;
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
});
