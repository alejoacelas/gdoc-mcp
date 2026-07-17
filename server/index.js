import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  RAW_ALLOWED_COMMANDS,
  asMcpResult,
  loadBundleProfile,
  runGdoc,
  withMarkdownFile,
} from "./runner.js";

const server = new McpServer({ name: "gdoc", version: "0.2.0" });
const profile = loadBundleProfile();

const account = z.string().optional().describe("Authenticated gdoc account name or email");
const doc = z.string().describe("Google Doc/Sheet URL or file ID");

function option(args, flag, value) {
  if (value !== undefined && value !== null && value !== "") args.push(flag, String(value));
}

function common(args, values) {
  option(args, "--account", values.account);
  if (values.quiet) args.push("--quiet");
  return args;
}

function tool(name, description, inputSchema, command, buildArgs) {
  server.registerTool(name, { description, inputSchema }, async (values) => {
    try {
      return asMcpResult(await runGdoc(command, buildArgs(values)));
    } catch (error) {
      return { content: [{ type: "text", text: String(error?.message ?? error) }], isError: true };
    }
  });
}

server.registerTool("connect_google", {
  description: "Connect Google Docs by opening Google's authorization page in the user's browser. Use this when gdoc reports that it is not authenticated. The bundled OAuth client is selected automatically; no terminal or copied token is needed.",
  inputSchema: {
    account: z.string().optional().describe("Google account email or local account name; defaults to this bundle's configured account"),
  },
}, async ({ account }) => {
  try {
    const selectedAccount = account || profile.default_account;
    const args = [];
    option(args, "--account", selectedAccount);
    const result = await runGdoc("auth", args);
    if (!result.ok) return asMcpResult(result);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          ok: true,
          account: selectedAccount || "default",
          profile: profile.slug,
          message: "Google connected. You can now use the Google Docs tools.",
        }),
      }],
    };
  } catch (error) {
    return { content: [{ type: "text", text: String(error?.message ?? error) }], isError: true };
  }
});

tool("list_files", "List Google Docs or Sheets in Drive or a folder.", {
  folder_id: z.string().optional(),
  type: z.enum(["docs", "sheets", "all"]).optional(),
  account,
}, "ls", ({ folder_id, type, account }) => {
  const args = common([], { account });
  option(args, "--type", type);
  if (folder_id) args.push("--", folder_id);
  return args;
});

tool("search_files", "Search Drive files by name or content.", {
  query: z.string(),
  title_only: z.boolean().optional(),
  account,
}, "find", ({ query, title_only, account }) => {
  const args = common([], { account });
  if (title_only) args.push("--title");
  return [...args, "--", query];
});

tool("read_document", "Read a Google Doc as Markdown or a Sheet as a table. Can include tabs, revisions, and inline comments.", {
  doc,
  account,
  comments: z.boolean().optional(),
  include_resolved_comments: z.boolean().optional(),
  tab: z.string().optional(),
  all_tabs: z.boolean().optional(),
  range: z.string().optional().describe("A1 range for Sheets"),
  max_bytes: z.number().int().nonnegative().optional(),
  no_images: z.boolean().optional(),
  revision: z.string().optional(),
  quiet: z.boolean().optional(),
}, "cat", (values) => {
  if (values.tab && values.all_tabs) throw new Error("provide tab or all_tabs, not both");
  const args = common([], values);
  if (values.comments) args.push("--comments");
  if (values.include_resolved_comments) args.push("--all");
  option(args, "--tab", values.tab);
  if (values.all_tabs) args.push("--all-tabs");
  option(args, "--range", values.range);
  option(args, "--max-bytes", values.max_bytes);
  if (values.no_images) args.push("--no-images");
  option(args, "--revision", values.revision);
  return [...args, "--", values.doc];
});

for (const [name, description, command] of [
  ["document_info", "Get document metadata, ownership, modified time, and size.", "info"],
  ["list_tabs", "List document tabs or spreadsheet worksheets.", "tabs"],
]) {
  tool(name, description, { doc, account, quiet: z.boolean().optional() }, command, (values) => [
    ...common([], values), "--", values.doc,
  ]);
}

tool("table_of_contents", "Extract a document heading outline with deep links.", {
  doc, account, tab: z.string().optional(), max_depth: z.number().int().nonnegative().optional(),
  no_links: z.boolean().optional(), quiet: z.boolean().optional(),
}, "toc", (values) => {
  const args = common([], values);
  option(args, "--tab", values.tab);
  option(args, "--max-depth", values.max_depth);
  if (values.no_links) args.push("--no-links");
  return [...args, "--", values.doc];
});

tool("list_revisions", "List retained revisions for a document.", {
  doc, account, limit: z.number().int().positive().optional(), quiet: z.boolean().optional(),
}, "revisions", (values) => {
  const args = common([], values);
  option(args, "--limit", values.limit);
  return [...args, "--", values.doc];
});

tool("list_comments", "List open comments, optionally including resolved threads.", {
  doc, account, include_resolved: z.boolean().optional(), quiet: z.boolean().optional(),
}, "comments", (values) => {
  const args = common([], values);
  if (values.include_resolved) args.push("--all");
  return [...args, "--", values.doc];
});

tool("get_comment", "Get one comment thread with full detail.", {
  doc, comment_id: z.string(), account, quiet: z.boolean().optional(),
}, "comment-info", (values) => [...common([], values), "--", values.doc, values.comment_id]);

tool("add_comment", "Add a document comment, optionally anchored to quoted text.", {
  doc, text: z.string(), quote: z.string().optional(), account, quiet: z.boolean().optional(),
}, "comment", (values) => {
  const args = common([], values);
  option(args, "--quote", values.quote);
  return [...args, "--", values.doc, values.text];
});

tool("reply_to_comment", "Reply to a document comment.", {
  doc, comment_id: z.string(), text: z.string(), account, quiet: z.boolean().optional(),
}, "reply", (values) => [...common([], values), "--", values.doc, values.comment_id, values.text]);

tool("resolve_comment", "Resolve a comment, optionally with a final message.", {
  doc, comment_id: z.string(), message: z.string().optional(), account, quiet: z.boolean().optional(),
}, "resolve", (values) => {
  const args = common([], values);
  option(args, "--message", values.message);
  return [...args, "--", values.doc, values.comment_id];
});

tool("reopen_comment", "Reopen a resolved comment.", {
  doc, comment_id: z.string(), account, quiet: z.boolean().optional(),
}, "reopen", (values) => [...common([], values), "--", values.doc, values.comment_id]);

tool("edit_document", "Replace text or a table cell in a document. Replacement text supports Markdown formatting.", {
  doc,
  old_text: z.string().optional(),
  new_text: z.string(),
  cell: z.string().optional().describe("Cell label or ROW,COL coordinates"),
  column: z.number().int().nonnegative().optional(),
  table: z.number().int().nonnegative().optional(),
  tab: z.string().optional(),
  replace_all: z.boolean().optional(),
  case_sensitive: z.boolean().optional(),
  normalize: z.boolean().optional(),
  account,
  quiet: z.boolean().optional(),
}, "edit", (values) => {
  if (!values.cell && values.old_text === undefined) throw new Error("old_text is required unless cell is provided");
  const args = common([], values);
  option(args, "--cell", values.cell);
  option(args, "--col", values.column);
  option(args, "--table", values.table);
  option(args, "--tab", values.tab);
  if (values.replace_all) args.push("--all");
  if (values.case_sensitive) args.push("--case-sensitive");
  if (values.normalize) args.push("--normalize");
  const positionals = values.cell ? [values.doc, values.new_text] : [values.doc, values.old_text, values.new_text];
  return [...args, "--", ...positionals];
});

server.registerTool("create_document", {
  description: "Create a Google Doc, optionally initialized from Markdown.",
  inputSchema: {
    title: z.string(), content: z.string().optional(), folder_id: z.string().optional(),
    page_mode: z.enum(["paged", "pageless"]).optional(), account,
  },
}, async (values) => {
  const execute = async (file) => {
    const args = common([], values);
    option(args, "--folder", values.folder_id);
    if (values.page_mode) args.push(`--${values.page_mode}`);
    option(args, "--file", file);
    return asMcpResult(await runGdoc("new", [...args, "--", values.title]));
  };
  try {
    return values.content === undefined ? await execute(undefined) : await withMarkdownFile(values.content, execute);
  } catch (error) {
    return { content: [{ type: "text", text: String(error?.message ?? error) }], isError: true };
  }
});

for (const [name, description, command] of [
  ["write_document", "Replace a whole document or one tab with Markdown.", "write"],
  ["insert_document", "Insert Markdown at the start or end of a document tab.", "insert"],
]) {
  server.registerTool(name, {
    description,
    inputSchema: {
      doc, content: z.string(), tab: z.string().optional(), position: z.enum(["start", "end"]).optional(),
      force: z.boolean().optional(), force_collapse_tabs: z.boolean().optional(), account, quiet: z.boolean().optional(),
    },
  }, async (values) => {
    try {
      return await withMarkdownFile(values.content, async (file) => {
        const args = common([], values);
        option(args, "--tab", values.tab);
        if (command === "insert") {
          if (!values.tab) throw new Error("tab is required for insert_document");
          option(args, "--position", values.position);
        }
        if (values.force) args.push("--force");
        if (values.force_collapse_tabs && command === "write") args.push("--force-collapse-tabs");
        return asMcpResult(await runGdoc(command, [...args, "--", values.doc, file]));
      });
    } catch (error) {
      return { content: [{ type: "text", text: String(error?.message ?? error) }], isError: true };
    }
  });
}

tool("add_tab", "Add a tab to an existing Google Doc.", {
  doc, title: z.string(), account, quiet: z.boolean().optional(),
}, "add-tab", (values) => [...common([], values), "--", values.doc, values.title]);

tool("copy_document", "Duplicate a document with a new title.", {
  doc, title: z.string(), account, quiet: z.boolean().optional(),
}, "cp", (values) => [...common([], values), "--", values.doc, values.title]);

tool("share_document", "Share a document with an email address.", {
  doc, email: z.string(), role: z.enum(["reader", "writer", "commenter"]).optional(), account,
  quiet: z.boolean().optional(),
}, "share", (values) => {
  const args = common([], values);
  option(args, "--role", values.role);
  return [...args, "--", values.doc, values.email];
});

server.registerTool("gdoc_cli", {
  description: "Run an allowlisted gdoc command for options not covered by typed tools. Arguments are passed directly without a shell.",
  inputSchema: {
    command: z.enum([...RAW_ALLOWED_COMMANDS]),
    args: z.array(z.string()).default([]).describe("Arguments after the subcommand; add --account when needed"),
  },
}, async ({ command, args }) => asMcpResult(await runGdoc(command, args)));

await server.connect(new StdioServerTransport());
