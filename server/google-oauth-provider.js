import crypto from "node:crypto";
import { InvalidGrantError, InvalidRequestError, InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";

const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/documents",
];

const token = () => crypto.randomBytes(32).toString("base64url");
const now = () => Math.floor(Date.now() / 1000);

export class GoogleOAuthProvider {
  constructor({ store, publicUrl, googleClientId, googleClientSecret, allowedDomain = "" }) {
    this.store = store;
    this.publicUrl = publicUrl.replace(/\/$/, "");
    this.googleClientId = googleClientId;
    this.googleClientSecret = googleClientSecret;
    this.allowedDomain = allowedDomain;
    this.clientsStore = {
      getClient: async (clientId) => (await this.store.read()).clients[clientId],
      registerClient: async (client) => this.store.mutate((data) => {
        data.clients[client.client_id] = client;
        return client;
      }),
    };
  }

  async authorize(client, params, res) {
    if (!client.redirect_uris.includes(params.redirectUri)) throw new InvalidRequestError("Unregistered redirect_uri");
    const state = token();
    const verifier = token();
    const nonce = token();
    const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
    await this.store.mutate((data) => {
      data.pending[state] = { client, params: { ...params, resource: params.resource?.href }, verifier, nonce, createdAt: now() };
    });
    const target = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    target.search = new URLSearchParams({
      client_id: this.googleClientId,
      redirect_uri: `${this.publicUrl}/oauth/google/callback`,
      response_type: "code",
      scope: GOOGLE_SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: "S256",
      ...(this.allowedDomain ? { hd: this.allowedDomain } : {}),
    }).toString();
    res.redirect(target.href);
  }

  async handleGoogleCallback(query, res) {
    const { code, state, error } = query;
    if (error) return res.status(400).send(`Google authorization failed: ${String(error)}`);
    const data = await this.store.read();
    const pending = data.pending[state];
    if (!pending || now() - pending.createdAt > 600) return res.status(400).send("Authorization request expired. Return to Claude and click Connect again.");

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.googleClientId,
        client_secret: this.googleClientSecret,
        code: String(code),
        code_verifier: pending.verifier,
        grant_type: "authorization_code",
        redirect_uri: `${this.publicUrl}/oauth/google/callback`,
      }),
    });
    const googleTokens = await response.json();
    if (!response.ok || !googleTokens.refresh_token || !googleTokens.id_token) {
      return res.status(502).send("Google did not return a reusable authorization grant. Return to Claude and try Connect again.");
    }
    const identityResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(googleTokens.id_token)}`);
    const identity = await identityResponse.json();
    if (!identityResponse.ok || identity.aud !== this.googleClientId || identity.email_verified !== "true" || identity.nonce !== pending.nonce) {
      return res.status(403).send("Google identity verification failed.");
    }
    if (this.allowedDomain && identity.hd !== this.allowedDomain) {
      return res.status(403).send(`Use an ${this.allowedDomain} Google account.`);
    }

    const authorizationCode = token();
    await this.store.mutate((current) => {
      delete current.pending[state];
      current.google[identity.sub] = {
        email: identity.email,
        refreshToken: googleTokens.refresh_token,
        scopes: GOOGLE_SCOPES,
      };
      current.codes[authorizationCode] = { ...pending, userId: identity.sub, createdAt: now() };
    });
    const target = new URL(pending.params.redirectUri);
    target.searchParams.set("code", authorizationCode);
    if (pending.params.state) target.searchParams.set("state", pending.params.state);
    res.redirect(target.href);
  }

  async challengeForAuthorizationCode(client, code) {
    const value = (await this.store.read()).codes[code];
    if (!value || value.client.client_id !== client.client_id) throw new InvalidGrantError("Invalid authorization code");
    return value.params.codeChallenge;
  }

  async exchangeAuthorizationCode(client, code, _verifier, redirectUri, resource) {
    return this.store.mutate((data) => {
      const value = data.codes[code];
      if (!value || value.client.client_id !== client.client_id || now() - value.createdAt > 600) throw new InvalidGrantError("Invalid authorization code");
      if (redirectUri && redirectUri !== value.params.redirectUri) throw new InvalidGrantError("redirect_uri does not match");
      const expectedResource = value.params.resource;
      if (resource && expectedResource && resource.href !== expectedResource) throw new InvalidGrantError("resource does not match");
      delete data.codes[code];
      return this.#issueTokens(data, value.userId, client.client_id, value.params.scopes ?? ["mcp:tools"], expectedResource);
    });
  }

  async exchangeRefreshToken(client, refreshToken, scopes, resource) {
    return this.store.mutate((data) => {
      const value = data.tokens[refreshToken];
      if (!value || value.type !== "refresh" || value.clientId !== client.client_id) throw new InvalidGrantError("Invalid refresh token");
      if (resource && value.resource && resource.href !== value.resource) throw new InvalidGrantError("resource does not match");
      return this.#issueAccessToken(data, value.userId, value.clientId, scopes ?? value.scopes, value.resource);
    });
  }

  async verifyAccessToken(accessToken) {
    const value = (await this.store.read()).tokens[accessToken];
    if (!value || value.type !== "access" || value.expiresAt <= now()) throw new InvalidTokenError("Invalid or expired token");
    return {
      token: accessToken,
      clientId: value.clientId,
      scopes: value.scopes,
      expiresAt: value.expiresAt,
      resource: value.resource ? new URL(value.resource) : undefined,
      extra: { userId: value.userId },
    };
  }

  async revokeToken(_client, request) {
    await this.store.mutate((data) => { delete data.tokens[request.token]; });
  }

  async googleCredentials(userId) {
    const value = (await this.store.read()).google[userId];
    if (!value) throw new InvalidTokenError("Google account is no longer connected");
    return {
      token: null,
      refresh_token: value.refreshToken,
      token_uri: "https://oauth2.googleapis.com/token",
      client_id: this.googleClientId,
      client_secret: this.googleClientSecret,
      scopes: value.scopes,
      universe_domain: "googleapis.com",
      account: "",
      expiry: null,
    };
  }

  #issueTokens(data, userId, clientId, scopes, resource) {
    const refreshToken = token();
    data.tokens[refreshToken] = { type: "refresh", userId, clientId, scopes, resource };
    return { ...this.#issueAccessToken(data, userId, clientId, scopes, resource), refresh_token: refreshToken };
  }

  #issueAccessToken(data, userId, clientId, scopes, resource) {
    const accessToken = token();
    data.tokens[accessToken] = { type: "access", userId, clientId, scopes, resource, expiresAt: now() + 3600 };
    return { access_token: accessToken, token_type: "bearer", expires_in: 3600, scope: scopes.join(" ") };
  }
}
