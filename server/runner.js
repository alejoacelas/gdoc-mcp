import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const ALLOWED_COMMANDS = new Set([
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
  if (!ALLOWED_COMMANDS.has(command)) {
    throw new Error(`unsupported gdoc command: ${command}`);
  }
  if (args.some((arg) => typeof arg !== "string" || arg.includes("\0"))) {
    throw new Error("gdoc arguments must be strings without NUL bytes");
  }
  return ["--json", "--allow-commands", command, command, ...args];
}

export function runGdoc(command, args = [], options = {}) {
  const argv = commandArgv(command, args);
  const gdocBin = options.gdocBin ?? resolveGdocBin(options.env);
  const env = { ...process.env, ...options.env, GDOC_AUTO_UPDATE: "0" };

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
    return {
      content: [{ type: "text", text: result.stdout.trim() || result.stderr.trim() || result.error || "gdoc failed with no output" }],
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
