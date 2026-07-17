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
    "#!/usr/bin/env node\nconsole.log(JSON.stringify({ok:true, argv:process.argv.slice(2)}));\n",
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
    assert.ok(tools.length >= 20);
    assert.ok(tools.some(({ name }) => name === "write_document"));

    const result = await client.callTool({
      name: "read_document",
      arguments: { doc: "doc id; touch /tmp/never", all_tabs: true, quiet: true },
    });
    assert.equal(result.isError, undefined);
    assert.deepEqual(JSON.parse(result.content[0].text).argv, [
      "--json", "--allow-commands", "cat", "cat", "--quiet", "--all-tabs", "--",
      "doc id; touch /tmp/never",
    ]);
  } finally {
    await client.close();
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
});
