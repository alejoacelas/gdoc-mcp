import { execFile } from "node:child_process";
import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const executionContext = new AsyncLocalStorage();

export function withGdocContext(options, callback) {
  return executionContext.run(options, callback);
}

export const RAW_ALLOWED_COMMANDS = new Set([
  "add-tab",
  "cat",
  "comment",
  "comment-info",
  "comments",
  "cp",
  "diff",
  "edit",
  "find",
  "images",
  "info",
  "insert",
  "ls",
  "new",
  "reopen",
  "reply",
  "resolve",
  "revisions",
  "share",
  "tabs",
  "toc",
  "write",
]);

const EXECUTABLE_COMMANDS = new Set(["auth", ...RAW_ALLOWED_COMMANDS]);

function candidateBundleRoots() {
  return [path.join(here, ".."), path.join(here, "..", "mcpb")];
}

export function loadBundleProfile() {
  for (const root of candidateBundleRoots()) {
    const profilePath = path.join(root, "config", "profile.json");
    if (!fs.existsSync(profilePath)) continue;
    try {
      return JSON.parse(fs.readFileSync(profilePath, "utf8"));
    } catch (error) {
      throw new Error(`invalid bundled profile at ${profilePath}: ${error.message}`);
    }
  }
  return { slug: "development", display_name: "Google Docs (gdoc)" };
}

export function resolveBundledCredentials() {
  for (const root of candidateBundleRoots()) {
    const credentials = path.join(root, "config", "oauth-client.json");
    if (fs.existsSync(credentials)) return credentials;
  }
  return null;
}

export function resolveGdocBin(env = process.env) {
  const configured = env.GDOC_BIN?.trim();
  if (configured && !configured.startsWith("${")) return configured;

  const bundleName = `gdoc-${process.arch}`;
  for (const bundled of [
    path.join(here, "..", "bin", bundleName),
    path.join(here, "..", "mcpb", "bin", bundleName),
  ]) {
    if (fs.existsSync(bundled)) return bundled;
  }
  return "gdoc";
}

export function commandArgv(command, args = []) {
  if (!EXECUTABLE_COMMANDS.has(command)) {
    throw new Error(`unsupported gdoc command: ${command}`);
  }
  if (args.some((arg) => typeof arg !== "string" || arg.includes("\0"))) {
    throw new Error("gdoc arguments must be strings without NUL bytes");
  }
  return ["--json", "--allow-commands", command, command, ...args];
}

export function runGdoc(command, args = [], options = {}) {
  options = { ...(executionContext.getStore() ?? {}), ...options };
  const argv = commandArgv(command, args);
  const gdocBin = options.gdocBin ?? resolveGdocBin(options.env);
  const env = { ...process.env, ...options.env, GDOC_AUTO_UPDATE: "0" };
  const bundledCredentials = resolveBundledCredentials();
  const profile = loadBundleProfile();
  if (bundledCredentials) env.GDOC_CLIENT_CREDENTIALS = bundledCredentials;
  if (profile.auth_domain) env.GDOC_AUTH_DOMAIN = profile.auth_domain;

  return new Promise((resolve) => {
    execFile(
      gdocBin,
      argv,
      { env, maxBuffer: 32 * 1024 * 1024 },
      (error, stdout = "", stderr = "") => {
        resolve({ ok: !error, stdout, stderr, error: error?.message ?? "" });
      },
    );
  });
}

export function asMcpResult(result) {
  if (!result.ok) {
    let text = result.stdout.trim() || result.stderr.trim() || result.error || "gdoc failed with no output";
    if (/Run `gdoc auth/.test(text)) {
      text += "\n\nUse the connect_google MCP tool to authenticate in your browser.";
    }
    return {
      content: [{ type: "text", text }],
      isError: true,
    };
  }

  let text = result.stdout.trim() || "{}";
  if (result.stderr.trim()) text += `\n\n[gdoc notice] ${result.stderr.trim()}`;
  return { content: [{ type: "text", text }] };
}

export async function withMarkdownFile(content, callback) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "gdoc-mcp-"));
  const file = path.join(dir, "content.md");
  try {
    await fs.promises.writeFile(file, content, { encoding: "utf8", mode: 0o600 });
    return await callback(file);
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
}
