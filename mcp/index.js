import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { filterLeasedTools, toolIsLeased } from "./lease.js";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { createToolCallHandler } from "./toolCallHandler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);
const strategyTools = require("../backend/src/services/mcpStrategyTools");
const { getToolInputSchema } = require("../backend/src/services/mcpContract");
const { terminateChild, clearTerminationTimer } = require("../backend/src/services/processTermination");

const sharedToolsPath = path.resolve(repoRoot, "shared/toolDefinitions.json");
const sharedTools = JSON.parse(fs.readFileSync(sharedToolsPath, "utf8")).tools;
const ALL_TOOLS = sharedTools.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));

const DEFAULT_TOOL_TIMEOUT_MS = 30000;
const MAX_OUTPUT_BYTES = 1024 * 1024;

function toolTimeoutMs() {
  const configured = Number(process.env.GENOS_MCP_TOOL_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0
    ? Math.min(Math.floor(configured), 30 * 60 * 1000)
    : DEFAULT_TOOL_TIMEOUT_MS;
}

function appendBounded(value, chunk) {
  const next = value + chunk.toString();
  return next.length > MAX_OUTPUT_BYTES ? next.slice(-MAX_OUTPUT_BYTES) : next;
}

const server = new Server(
  { name: "genos-mcp", version: "3.0.0" },
  { capabilities: { tools: {} } }
);

function resolveGenosBin() {
  if (process.env.GENOS_BIN && fs.existsSync(process.env.GENOS_BIN)) {
    return process.env.GENOS_BIN;
  }
  const isWin = process.platform === "win32";
  const binaryName = isWin ? "genos.exe" : "genos";
  const searchPaths = [
    path.join(repoRoot, "target/debug", binaryName),
    path.join(repoRoot, "target/release", binaryName),
    path.join(process.cwd(), "target/debug", binaryName),
  ];
  for (const p of searchPaths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function runExecutable({ cmd, args, cwd, timeoutMs = toolTimeoutMs() }) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, shell: false, detached: process.platform !== "win32" });
    let out = "";
    let err = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      terminateChild(child);
      reject(new Error(`MCP tool timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
    child.stdout.on("data", (d) => { out = appendBounded(out, d); });
    child.stderr.on("data", (d) => { err = appendBounded(err, d); });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTerminationTimer(child);
      if (code === 0) resolve(out);
      else reject(new Error(`Process exited with code ${code}: ${err || out}`));
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTerminationTimer(child);
      reject(error);
    });
  });
}

async function runGenosCli(args) {
  const genosBin = resolveGenosBin();
  if (genosBin) {
    return runExecutable({ cmd: genosBin, args, cwd: repoRoot });
  }
  const cargoPath = process.platform === "win32" ? "cargo.exe" : "cargo";
  const manifest = path.join(repoRoot, "Cargo.toml");
  return runExecutable({
    cmd: cargoPath,
    args: ["run", "-q", "--manifest-path", manifest, "-p", "genos-cli", "--", ...args],
    cwd: repoRoot
  });
}

async function runOrchestrator(payload) {
  const bridge = process.env.GENOS_ORCHESTRATOR_BRIDGE || path.join(repoRoot, "backend/bin/genos-orchestrate.cjs");
  return runExecutable({ cmd: process.execPath, args: [bridge, JSON.stringify(payload)], cwd: repoRoot });
}

for (const tool of ALL_TOOLS) tool.inputSchema = getToolInputSchema(tool.name, tool.inputSchema);

function getFilteredTools() {
  return filterLeasedTools(ALL_TOOLS);
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: getFilteredTools(),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params;
  if (!toolIsLeased(name, ALL_TOOLS)) return {
    content: [{ type: "text", text: `Tool '${name}' is outside the active GenOS MCP lease.` }],
    isError: true,
    _meta: { code: 'MCP_TOOL_LEASE_DENIED' }
  };
  return createToolCallHandler({ runOrchestrator, runGenosCli, executeStrategyTool: strategyTools.executeStrategyTool })(request);
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("🧬 GenOS MCP Server running on stdio");
