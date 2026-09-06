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

function runExecutable(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, shell: false });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("close", (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`Process exited with code ${code}: ${err || out}`));
    });
    child.on("error", (err) => reject(err));
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
        strategy: { type: "string", description: "Optional strategy hint from the 77 available." },
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
    description: "Execute one of the 96 GenOS strategic primitives directly with telemetry and verification.",
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
      case "genos_snapshot":
        result = await runGenosCli(["snapshot", "create", "--agent", args.agent, "--out", args.out]);
        break;
      case "genos_capsule_create":
        result = await runGenosCli(["capsule", "create", "--snapshot", args.snapshot_id || "ROOT"]);
        break;
      case "genos_v2_init":
        result = await runGenosCli(["init"]);
        break;
      case "genos_v2_fork":
        result = await runGenosCli(["agent", "fork", "--parent-id", args.parent_id || "ROOT"]);
        break;
      default:
        result = await runGenosCli(["--help"]);
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
