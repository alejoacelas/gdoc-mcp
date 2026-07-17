import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { getOAuthProtectedResourceMetadataUrl, mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createGdocServer } from "./index.js";
import { EncryptedStore } from "./encrypted-store.js";
import { GoogleOAuthProvider } from "./google-oauth-provider.js";
import { withGdocContext } from "./runner.js";

for (const name of ["PUBLIC_URL", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "DATA_ENCRYPTION_KEY"]) {
  if (!process.env[name]) throw new Error(`${name} is required`);
}

const publicUrl = process.env.PUBLIC_URL.replace(/\/$/, "");
const mcpUrl = new URL(`${publicUrl}/mcp`);
const dataFile = process.env.DATA_FILE ?? path.join(process.env.DATA_DIR ?? "/data", "gdoc.enc.json");
const provider = new GoogleOAuthProvider({
  store: new EncryptedStore(dataFile),
  publicUrl,
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  allowedDomain: process.env.ALLOWED_GOOGLE_DOMAIN ?? "",
});

const app = createMcpExpressApp({ host: "0.0.0.0" });
app.set("trust proxy", 1);
app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/oauth/google/callback", (req, res, next) => {
  provider.handleGoogleCallback(req.query, res).catch(next);
});
app.use(mcpAuthRouter({
  provider,
  issuerUrl: new URL(publicUrl),
  resourceServerUrl: mcpUrl,
  scopesSupported: ["mcp:tools"],
  resourceName: "gdoc",
  serviceDocumentationUrl: new URL("https://github.com/alejoacelas/gdoc-mcp"),
  clientRegistrationOptions: { clientSecretExpirySeconds: 0 },
}));

const auth = requireBearerAuth({
  verifier: provider,
  requiredScopes: [],
  resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpUrl),
});
const sessions = new Map();

async function withGoogleHome(req, callback) {
  const userId = req.auth?.extra?.userId;
  if (!userId) throw new Error("Authenticated request is missing its Google user");
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "gdoc-remote-"));
  const config = path.join(dir, ".config", "gdoc");
  try {
    await fs.promises.mkdir(config, { recursive: true, mode: 0o700 });
    await fs.promises.writeFile(
      path.join(config, "token.json"),
      JSON.stringify(await provider.googleCredentials(userId)),
      { mode: 0o600 },
    );
    return await withGdocContext({ env: { HOME: dir }, gdocBin: process.env.GDOC_BIN ?? "gdoc" }, callback);
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
}

async function handleMcp(req, res) {
  const sessionId = req.headers["mcp-session-id"];
  const userId = req.auth.extra.userId;
  let record = sessionId ? sessions.get(sessionId) : undefined;
  if (record && record.userId !== userId) return res.status(403).json({ error: "Session belongs to another user" });

  if (!record && !sessionId && req.method === "POST" && isInitializeRequest(req.body)) {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: (id) => sessions.set(id, { transport, userId }),
    });
    transport.onclose = () => {
      if (transport.sessionId) sessions.delete(transport.sessionId);
    };
    await createGdocServer({ remote: true }).connect(transport);
    record = { transport, userId };
  }
  if (!record) return res.status(400).json({ error: "Invalid or missing MCP session" });
  await withGoogleHome(req, () => record.transport.handleRequest(req, res, req.body));
}

app.all("/mcp", auth, (req, res, next) => handleMcp(req, res).catch(next));
app.use((error, _req, res, _next) => {
  console.error(error);
  if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, "0.0.0.0", () => console.error(`gdoc remote MCP listening on ${publicUrl}/mcp`));
