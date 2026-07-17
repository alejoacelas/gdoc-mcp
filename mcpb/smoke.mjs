import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";

const transport = new StdioClientTransport({
  command: "node",
  args: [path.resolve("server/index.js")],
  env: { ...process.env },
});
const client = new Client({ name: "gdoc-smoke", version: "0.2.0" });
await client.connect(transport);
const { tools } = await client.listTools();
console.log(`${tools.length} tools: ${tools.map((tool) => tool.name).join(", ")}`);
const result = await client.callTool({ name: "list_files", arguments: { type: "docs" } });
console.log(result.content[0].text.slice(0, 500));
await client.close();
