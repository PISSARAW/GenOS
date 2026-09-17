#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { filterLeasedTools, toolIsLeased } from "./lease.js";
import { createToolCallHandler } from "./toolCallHandler.js";
import { executeNodeFallback } from "./nodeCliFallback.js";
import { resolveRepoRoot } from "./repoRoot.js";
import { loadToolCatalog } from "./catalog.js";
import { loadToolSchemaResolver } from "./contract.js";
import { loadStrategyBridge } from "./strategyBridge.js";
import { createSamplingBroker } from "./samplingBroker.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const repoRoot = resolveRepoRoot();
const workingDir = repoRoot || process.cwd();

const { terminateChild, clearTerminationTimer } = require("./processTermination.cjs");
const strategyTools = loadStrategyBridge(repoRoot);
const ALL_TOOLS = loadToolCatalog(repoRoot);
const getToolInputSchema = loadToolSchemaResolver(repoRoot);

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
const samplingBroker = await createSamplingBroker(server);

function resolveGenosBin() {
  const isWin = process.platform === "win32";
  const binaryName = isWin ? "genos.exe" : "genos";
  const searchPaths = [
    path.join(workingDir, "target/debug", binaryName),
    path.join(workingDir, "target/release", binaryName),
    path.join(process.cwd(), "target/debug", binaryName),
  ];
  for (const p of searchPaths) {
    if (fs.existsSync(p)) return p;
  }
  if (process.env.GENOS_BIN && !process.env.GENOS_BIN.toLowerCase().includes('program files')) {
    if (fs.existsSync(process.env.GENOS_BIN)) return process.env.GENOS_BIN;
    if (isWin && fs.existsSync(`${process.env.GENOS_BIN}.exe`)) return `${process.env.GENOS_BIN}.exe`;
  }
  return null;
}

function runExecutable({ cmd, args, cwd = workingDir, timeoutMs = toolTimeoutMs(), env = process.env }) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env, shell: false, detached: process.platform !== "win32" });
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

async function runGenosCli(args, toolArgs = {}) {
  const genosBin = resolveGenosBin();
  if (genosBin) {
    try {
      return await runExecutable({ cmd: genosBin, args, cwd: workingDir });
    } catch (binErr) {
      console.error(`[GENOS_FALLBACK] Binary execution failed (${binErr.message}); falling back to Node bridge.`);
    }
  }
  const cargoPath = process.platform === "win32" ? "cargo.exe" : "cargo";
  const manifest = path.join(workingDir, "Cargo.toml");
  if (fs.existsSync(manifest)) {
    try {
      return await runExecutable({
        cmd: cargoPath,
        args: ["run", "-q", "--manifest-path", manifest, "-p", "genos-cli", "--", ...args],
        cwd: workingDir
      });
    } catch (_) {}
  }
  return executeNodeFallback(args, toolArgs);
}

function resolveOrchestratorBridge() {
  const override = process.env.GENOS_ORCHESTRATOR_BRIDGE;
  if (override && !override.toLowerCase().includes('program files')) return override;
  const candidates = [
    repoRoot ? path.join(repoRoot, "backend", "bin", "genos-orchestrate.cjs") : null,
    path.join(__dirname, "..", "backend", "bin", "genos-orchestrate.cjs")
  ];
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || null;
}

async function runOrchestrator(payload) {
  const bridge = resolveOrchestratorBridge();
  if (!bridge) {
    throw new Error("GenOS orchestrator bridge not found. Set GENOS_ORCHESTRATOR_BRIDGE or install the GenOS repository.");
  }
  return runExecutable({
    cmd: process.execPath,
    args: [bridge, JSON.stringify({ executor: 'caller_mcp', provider: process.env.GENOS_MCP_PROVIDER || 'mcp-host', ...payload })],
    cwd: workingDir,
    env: { ...process.env, GENOS_MCP_SAMPLING_URL: samplingBroker.url, GENOS_MCP_SAMPLING_TOKEN: samplingBroker.token }
  });
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
