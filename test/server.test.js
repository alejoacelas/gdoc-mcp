import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("stdio server lists tools and invokes gdoc without a shell", async () => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "gdoc-mcp-test-"));
  const fake = path.join(dir, "fake-gdoc");
  await fs.promises.writeFile(
    fake,
    "#!/usr/bin/env node\nconsole.log(JSON.stringify({ok:true, argv:process.argv.slice(2), credentials:process.env.GDOC_CLIENT_CREDENTIALS||null, domain:process.env.GDOC_AUTH_DOMAIN||null}));\n",
    { mode: 0o700 },
  );

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.resolve("server/index.js")],
    env: { ...process.env, GDOC_BIN: fake },
  });
  const client = new Client({ name: "test", version: "0.0.0" });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.ok(tools.length >= 22);
    assert.ok(tools.some(({ name }) => name === "write_document"));
    assert.ok(tools.some(({ name }) => name === "connect_google"));

    const result = await client.callTool({
      name: "read_document",
      arguments: { doc: "doc id; touch /tmp/never", all_tabs: true, quiet: true },
    });
    assert.equal(result.isError, undefined);
    assert.deepEqual(JSON.parse(result.content[0].text).argv, [
      "--json", "--allow-commands", "cat", "cat", "--quiet", "--all-tabs", "--",
      "doc id; touch /tmp/never",
    ]);

    const connected = await client.callTool({
      name: "connect_google",
      arguments: { account: "me@example.com" },
    });
    assert.equal(connected.isError, undefined);
    assert.deepEqual(JSON.parse(connected.content[0].text), {
      ok: true,
      account: "me@example.com",
      profile: "development",
      message: "Google connected. You can now use the Google Docs tools.",
    });
  } finally {
    await client.close();
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
});
