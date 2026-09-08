import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { filterLeasedTools, toolIsLeased } from "./lease.js";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);
const strategyTools = require("../backend/src/services/mcpStrategyTools");
const { getToolInputSchema } = require("../backend/src/services/mcpContract");
const { terminateChild, clearTerminationTimer } = require("../backend/src/services/processTermination");

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

function runExecutable(cmd, args, cwd, timeoutMs = toolTimeoutMs()) {
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
    return runExecutable(genosBin, args, repoRoot);
  }
  const cargoPath = process.platform === "win32" ? "cargo.exe" : "cargo";
  const manifest = path.join(repoRoot, "Cargo.toml");
  return runExecutable(
    cargoPath,
    ["run", "-q", "--manifest-path", manifest, "-p", "genos-cli", "--", ...args],
    repoRoot
  );
}

async function runOrchestrator(payload) {
  const bridge = process.env.GENOS_ORCHESTRATOR_BRIDGE || path.join(repoRoot, "backend/bin/genos-orchestrate.cjs");
  return runExecutable(process.execPath, [bridge, JSON.stringify(payload)], repoRoot);
}

const ALL_TOOLS = [
  {
    name: "genos_orchestrate",
    description: "Launch or continue an autonomous GenOS mission. Decomposes tasks, coordinates workers, and produces verified claims.",
    inputSchema: {
      type: "object",
      properties: {
        mission: { type: "string", description: "Goal or user request to achieve." },
        strategy: { type: "string", description: "Optional strategy hint from the 78 available." },
        background: { type: "boolean", description: "True to run detached in the background." },
      },
      required: ["mission"],
    },
  },
  {
    name: "genos_delegate_worker",
    description: "Delegate an isolated bounded sub-task to a GenOS worker inside a dedicated capsule.",
    inputSchema: {
      type: "object",
      properties: {
        mission: { type: "string", description: "Sub-task for the delegated worker." },
        role: { type: "string", description: "Specialized role of the worker." },
      },
      required: ["mission"],
    },
  },
  {
    name: "genos_snapshot",
    description: "Create an immutable content-addressed checkpoint of the workspace.",
    inputSchema: {
      type: "object",
      properties: {
        agent: { type: "string", description: "Path to the agent genome input." },
        out: { type: "string", description: "Output path for the snapshot JSON." },
      },
      required: ["agent", "out"],
    },
  },
  {
    name: "genos_replay",
    description: "Replay a validated snapshot and return its reproduction receipt.",
    inputSchema: {
      type: "object",
      properties: {
        snapshot: { type: "string", description: "Snapshot path relative to the GenOS workspace root." },
      },
      required: ["snapshot"],
    },
  },
  {
    name: "genos_capsule_create",
    description: "Provision an isolated copy-on-write execution capsule from a snapshot.",
    inputSchema: {
      type: "object",
      properties: {
        snapshot_id: { type: "string", description: "Source snapshot ID." },
        seed: { type: "string", description: "Optional seed identifier." },
      },
      required: ["snapshot_id"],
    },
  },
  {
    name: "genos_execute_primitive",
    description: "Execute one of the 97 GenOS strategic primitives directly with telemetry and verification.",
    inputSchema: {
      type: "object",
      properties: {
        primitive_name: { type: "string", description: "Name of the primitive (e.g. mcts_select, stdp_update)." },
        args: { type: "object", description: "Input arguments for the primitive." },
      },
      required: ["primitive_name"],
    },
  },
  {
    name: "genos_change_strategy",
    description: "Switch active strategy portfolio at any runtime decision gate based on empirical evidence.",
    inputSchema: {
      type: "object",
      properties: {
        strategy: { type: "string", description: "Target strategy identifier." },
        reason: { type: "string", description: "Evidence justifying the transition." },
      },
      required: ["strategy", "reason"],
    },
  },
  {
    name: "genos_report_progress",
    description: "Report concise milestone progress or blocker update to the orchestrator and user.",
    inputSchema: {
      type: "object",
      properties: {
        phase: { type: "string", description: "Current phase name." },
        message: { type: "string", description: "Outcome and next steps." },
        progress_percent: { type: "number", minimum: 0, maximum: 100 },
      },
      required: ["phase", "message"],
    },
  },
  {
    name: "genos_change_organization",
    description: "Modify the communication and routing topology of the agent collective.",
    inputSchema: {
      type: "object",
      properties: {
        organization: { type: "string", description: "Target organization topology." },
        reason: { type: "string", description: "Justification for topology change." },
      },
      required: ["organization", "reason"],
    },
  },
  {
    name: "genos_organization_state",
    description: "Read the active organization topology, permissions, and visible communication links.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "genos_worker_publish",
    description: "Publish evidence, hypotheses, or signals to peer workers through enforced routing.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", description: "Type of publication." },
        content: { type: "string", description: "Message payload." },
      },
      required: ["kind", "content"],
    },
  },
  {
    name: "genos_worker_inbox",
    description: "Retrieve messages and evidence visible to this worker under the current topology.",
    inputSchema: {
      type: "object",
      properties: {
        after_id: { type: "integer", description: "Cursor offset." },
        limit: { type: "integer", description: "Max messages to return." },
      },
    },
  },
  {
    name: "genos_trinity_launch",
    description: "Deploy Trinity worlds for deep comparative exploration.",
    inputSchema: {
      type: "object",
      properties: { mission: { type: "string", description: "Mission to analyze." } },
      required: ["mission"],
    },
  },
  {
    name: "genos_a_team_preview",
    description: "Compose a multidisciplinary A-Team for a mission.",
    inputSchema: {
      type: "object",
      properties: {
        project_goal: { type: "string", description: "Overarching project goal." },
        sub_systems: { type: "array", items: { type: "string" }, description: "Distinct subsystems." },
      },
      required: ["project_goal", "sub_systems"],
    },
  },
  {
    name: "genos_merge",
    description: "Merge an isolated branch under invariants.",
    inputSchema: {
      type: "object",
      properties: {
        branch_id: { type: "string", description: "Branch ID to merge." },
        conditions: { type: "string", description: "Conditions to satisfy." },
      },
      required: ["branch_id"],
    },
  },
  {
    name: "genos_audit",
    description: "Audit a snapshot or lineage trace.",
    inputSchema: {
      type: "object",
      properties: {
        snapshot_id: { type: "string", description: "Snapshot ID to audit." },
        output: { type: "string", description: "Audit output path." },
      },
      required: ["snapshot_id"],
    },
  },
  {
    name: "genos_biomimicry",
    description: "Invoke a native biomimetic feature.",
    inputSchema: {
      type: "object",
      properties: {
        feature: { type: "string", description: "Biomimetic feature name." },
        action: { type: "string", description: "Feature action." },
        params: { type: "object", description: "Optional feature parameters." },
      },
      required: ["feature", "action"],
    },
  },
  {
    name: "genos_v2_init",
    description: "Initialize GenOS workspace state.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "genos_v2_fork",
    description: "Fork workspace state into an isolated branch.",
    inputSchema: {
      type: "object",
      properties: {
        parent_id: { type: "string", description: "Parent snapshot or branch ID." },
      },
    },
  },
];

for (const tool of ALL_TOOLS) tool.inputSchema = getToolInputSchema(tool.name, tool.inputSchema);

function getFilteredTools() {
  return filterLeasedTools(ALL_TOOLS);
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: getFilteredTools(),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  if (!toolIsLeased(name, ALL_TOOLS)) {
    return {
      content: [{ type: "text", text: `Tool '${name}' is outside the active GenOS MCP lease.` }],
      isError: true,
    };
  }
  try {
    let result = "";
    switch (name) {
      case "genos_execute_primitive": {
        const primitiveArgs = {
          ...args,
          primitive: args.primitive || args.primitive_name || args.name,
        };
        const execution = await strategyTools.executeStrategyTool(name, primitiveArgs);
        if (!execution) throw new Error(`Strategy tool '${name}' is unavailable.`);
        if (!execution.success) throw new Error(execution.output?.error || `Primitive '${args.primitive_name || args.primitive || args.name || ''}' failed.`);
        result = JSON.stringify(execution.output);
        break;
      }
      case "genos_orchestrate":
        result = await runOrchestrator({ action: "orchestrate", ...args });
        break;
      case "genos_delegate_worker":
        result = await runOrchestrator({ action: "dispatch_worker", background: false, ...args });
        break;
      case "genos_change_strategy":
        result = await runOrchestrator({ action: "change_strategy", ...args });
        break;
      case "genos_report_progress":
        result = await runOrchestrator({ action: "report_progress", ...args });
        break;
      case "genos_change_organization":
        result = await runOrchestrator({ action: "change_organization", ...args });
        break;
      case "genos_organization_state":
        result = await runOrchestrator({ action: "organization_state", ...args });
        break;
      case "genos_worker_publish":
        result = await runOrchestrator({ action: "organization_publish", ...args });
        break;
      case "genos_worker_inbox":
        result = await runOrchestrator({ action: "organization_inbox", ...args });
        break;
      case "genos_trinity_launch":
        result = await runOrchestrator({ action: "dispatch_trinity", ...args });
        break;
      case "genos_a_team_preview":
        result = await runOrchestrator({ action: "dispatch_team", ...args });
        break;
      case "genos_snapshot":
        result = await runGenosCli(["snapshot", "create", "--agent", args.agent, "--out", args.out]);
        break;
      case "genos_replay":
        if (!args.snapshot) throw new Error("genos_replay requires a snapshot reference.");
        result = await runGenosCli(["replay", "basic", "--snapshot", args.snapshot]);
        break;
      case "genos_capsule_create":
        result = await runGenosCli(["capsule", "create", "--snapshot", args.snapshot_id || "ROOT", ...(args.seed ? ["--seed", args.seed] : [])]);
        break;
      case "genos_merge":
        result = await runGenosCli(["merge", args.branch_id, ...(args.conditions ? ["--conditions", args.conditions] : [])]);
        break;
      case "genos_audit":
        result = await runGenosCli(["audit", args.snapshot_id, "--output", args.output || "audit.log"]);
        break;
      case "genos_biomimicry":
        result = await runGenosCli(["biomimicry", "bio-feature", "--feature", args.feature, "--action", args.action]);
        break;
      case "genos_v2_init":
        result = await runGenosCli(["init"]);
        break;
      case "genos_v2_fork":
        result = await runGenosCli(["agent", "fork", "--parent-id", args.parent_id || "ROOT"]);
        break;
      default:
        throw new Error(`Unsupported MCP tool '${name}'.`);
        break;
    }
    return { content: [{ type: "text", text: result }] };
  } catch (e) {
    return { content: [{ type: "text", text: e.message }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("🧬 GenOS MCP Server running on stdio");
