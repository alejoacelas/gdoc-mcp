import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { asMcpResult, commandArgv, resolveGdocBin, withMarkdownFile } from "../server/runner.js";

test("commandArgv forces JSON and restricts the CLI subcommand", () => {
  assert.deepEqual(commandArgv("cat", ["--quiet", "--", "doc-id"]), [
    "--json", "--allow-commands", "cat", "cat", "--quiet", "--", "doc-id",
  ]);
});

test("commandArgv rejects commands outside the MCP allowlist", () => {
  assert.throws(() => commandArgv("auth"), /unsupported gdoc command/);
});

test("resolveGdocBin honors explicit configuration", () => {
  assert.equal(resolveGdocBin({ GDOC_BIN: "/opt/gdoc" }), "/opt/gdoc");
  assert.notEqual(resolveGdocBin({ GDOC_BIN: "${user_config.gdoc_bin}" }), "${user_config.gdoc_bin}");
});

test("asMcpResult preserves structured errors and successful stderr notices", () => {
  assert.deepEqual(asMcpResult({ ok: false, stdout: "{\"ok\":false}", stderr: "ERR", error: "" }), {
    content: [{ type: "text", text: "{\"ok\":false}" }], isError: true,
  });
  assert.equal(
    asMcpResult({ ok: true, stdout: "{\"ok\":true}\n", stderr: "changed", error: "" }).content[0].text,
    "{\"ok\":true}\n\n[gdoc notice] changed",
  );
});

test("withMarkdownFile removes its private temporary file", async () => {
  let seen;
  await withMarkdownFile("# Hello", async (file) => {
    seen = file;
    assert.equal(await fs.promises.readFile(file, "utf8"), "# Hello");
    assert.equal((await fs.promises.stat(file)).mode & 0o777, 0o600);
  });
  assert.equal(fs.existsSync(seen), false);
});
