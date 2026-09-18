#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { spawn } from "child_process";
import fs from "fs";
import os from "os";
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

function processStdoutChunk({ state, chunk, onStdout }) {
  const text = state.remainder + chunk.toString();
  const lines = text.split(/\r?\n/);
  state.remainder = lines.pop() || "";
  for (const line of lines) {
    if (!line.startsWith("GENOS_STREAM:")) {
      state.output = appendBounded(state.output, `${line}\n`);
      continue;
    }
    try {
      const event = JSON.parse(line.slice("GENOS_STREAM:".length));
      if (onStdout) state.callbackChain = state.callbackChain.then(() => onStdout(event));
    } catch (_) {
      state.output = appendBounded(state.output, `${line}\n`);
    }
  }
  return state;
}

function topologyTerminal(eventType) {
  return new Set([
    'A_TEAM_STAGES_COMPLETED', 'A_TEAM_STAGES_FAILED',
    'TRINITY_MISSION_COMPLETED', 'TRINITY_MISSION_FAILED',
    'BIOLOGICAL_MISSION_COMPLETED', 'BIOLOGICAL_MISSION_FAILED'
  ]).has(eventType);
}

async function tailTelemetryFile({ filePath, onTelemetry, timeoutMs }) {
  const startedAt = Date.now();
  let offset = 0;
  let buffer = '';
  let terminal = false;
  while (Date.now() - startedAt < timeoutMs && !terminal) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const parsed = await parseTelemetryLines({ content: content.slice(offset), buffer, onTelemetry });
      offset = content.length;
      buffer = parsed.buffer;
      terminal = parsed.terminal;
    } catch (_) {}
    if (!terminal) await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function parseTelemetryLines({ content, buffer, onTelemetry }) {
  const lines = (buffer + content).split(/\r?\n/);
  const remainder = lines.pop() || '';
  let terminal = false;
  for (const line of lines.filter(Boolean)) {
    try {
      const event = JSON.parse(line);
      await onTelemetry(event);
      terminal = terminal || topologyTerminal(event.eventType);
    } catch (_) {}
  }
  return { buffer: remainder, terminal };
}

const server = new Server(
  { name: "genos-mcp", version: "3.0.0" },
  { capabilities: { tools: {} } }
);
const samplingBroker = await createSamplingBroker(server, ALL_TOOLS);

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

function runExecutable({ cmd, args, cwd = workingDir, timeoutMs = toolTimeoutMs(), env = process.env, onStdout }) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env, shell: false, detached: process.platform !== "win32" });
    const state = { output: "", remainder: "", callbackChain: Promise.resolve() };
    let err = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      terminateChild(child);
      reject(new Error(`MCP tool timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
    child.stdout.on("data", (d) => processStdoutChunk({ state, chunk: d, onStdout }));
    child.stderr.on("data", (d) => { err = appendBounded(err, d); });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTerminationTimer(child);
      if (state.remainder) state.output = appendBounded(state.output, state.remainder);
      state.callbackChain.then(() => {
        if (code === 0) resolve(state.output);
        else reject(new Error(`Process exited with code ${code}: ${err || state.output}`));
      }).catch((error) => reject(error));
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

async function runOrchestrator(payload, { onTelemetry } = {}) {
  const executor = String(payload.executor || '').trim().toLowerCase() || 'caller_mcp';
  if (payload.action === 'orchestrate' && executor === 'caller_mcp' && !server.getClientCapabilities()?.sampling) {
    throw new Error('MCP_SAMPLING_UNAVAILABLE: the connected MCP client does not provide sampling. Use a sampling-capable host or callerSession.mjs.');
  }
  const bridge = resolveOrchestratorBridge();
  if (!bridge) {
    throw new Error("GenOS orchestrator bridge not found. Set GENOS_ORCHESTRATOR_BRIDGE or install the GenOS repository.");
  }
  const topology = isTopologyAction(payload.action);
  const relay = createTelemetryRelay({ topology, onTelemetry });
  const execution = await executeBridge({ payload, bridge, executor, relay });
  if (topology) await finishTopologyRelay({ payload, relay });
  if (execution.error) throw execution.error;
  return formatTopologyResult({ result: execution.result, relay, topology });
}

function isTopologyAction(action) { return ['dispatch_team', 'dispatch_trinity', 'dispatch_biological'].includes(action); }

function createTelemetryRelay({ topology, onTelemetry }) {
  const streamFile = topology ? path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'genos-mcp-')), 'telemetry.ndjson') : null;
  const delivered = new Set();
  const events = [];
  const deliver = topology || onTelemetry ? (event) => {
    const key = event.id || `${event.timestamp}:${event.eventType}:${event.agentId}`;
    if (delivered.has(key)) return Promise.resolve();
    delivered.add(key);
    events.push(event);
    return onTelemetry ? onTelemetry(event) : Promise.resolve();
  } : undefined;
  return { streamFile, events, deliver };
}

async function executeBridge({ payload, bridge, executor, relay }) {
  try {
    const result = await runExecutable({
      cmd: process.execPath,
      args: [bridge, JSON.stringify({ ...payload, executor, provider: payload.provider || process.env.GENOS_MCP_PROVIDER || 'mcp-host' })],
      cwd: workingDir,
      env: { ...process.env, GENOS_STREAM_TELEMETRY: '1', ...(relay.streamFile ? { GENOS_MCP_TELEMETRY_FILE: relay.streamFile } : {}), GENOS_MCP_SAMPLING_URL: samplingBroker.url, GENOS_MCP_TOOL_URL: samplingBroker.toolUrl, GENOS_MCP_SAMPLING_TOKEN: samplingBroker.token },
      onStdout: relay.deliver
    });
    return { result, error: null };
  } catch (error) { return { result: undefined, error }; }
}

async function finishTopologyRelay({ payload, relay }) {
  if (!relay.streamFile) return;
  await tailTelemetryFile({ filePath: relay.streamFile, onTelemetry: relay.deliver, timeoutMs: Math.min(toolTimeoutMs(), Number(payload.timeoutMs) || 14 * 60 * 1000) });
  try { fs.unlinkSync(relay.streamFile); fs.rmdirSync(path.dirname(relay.streamFile)); } catch (_) {}
}

function formatTopologyResult({ result, relay, topology }) {
  if (!topology) return result;
  try { return JSON.stringify({ ...JSON.parse(result), telemetry: relay.events }); } catch (_) { return result; }
}

for (const tool of ALL_TOOLS) tool.inputSchema = getToolInputSchema(tool.name, tool.inputSchema);

function getFilteredTools() {
  return filterLeasedTools(ALL_TOOLS);
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: getFilteredTools(),
}));

const handleToolCall = createToolCallHandler({ runOrchestrator, runGenosCli, executeStrategyTool: strategyTools.executeStrategyTool });
samplingBroker.setToolHandler((input) => handleToolCall({ params: input }));

server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  const { name } = request.params;
  if (!toolIsLeased(name, ALL_TOOLS)) return {
    content: [{ type: "text", text: `Tool '${name}' is outside the active GenOS MCP lease.` }],
    isError: true,
    _meta: { code: 'MCP_TOOL_LEASE_DENIED' }
  };
  return handleToolCall(request, extra);
});

const transport = new StdioServerTransport();
server.onclose = () => samplingBroker.close();
await server.connect(transport);
console.error("🧬 GenOS MCP Server running on stdio");
