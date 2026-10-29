import { validateCliArguments } from "./argumentValidation.js";
import { resolveRepoRoot } from "./repoRoot.js";
import { loadToolCatalog } from "./catalog.js";
import { toolIsLeased } from "./lease.js";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import path from "node:path";
import { beginActorCall, finishActorCall, bodyMetadata } from './actorReceipt.mjs';

const require = createRequire(import.meta.url);
const REPO_ROOT = resolveRepoRoot();
const HAS_BACKEND_RUNTIME = Boolean(REPO_ROOT
  && existsSync(path.join(REPO_ROOT, 'backend/src/db/seedTools.js'))
  && existsSync(path.join(REPO_ROOT, 'backend/src/services/mcpToolRegistry.js')));
const REPO_REQUIRE = HAS_BACKEND_RUNTIME ? createRequire(path.join(REPO_ROOT, 'package.json')) : null;
const DEVELOPMENT = REPO_REQUIRE ? REPO_REQUIRE('./backend/src/services/mcpDevelopmentTools.js') : null;
const CATALOG = loadToolCatalog(REPO_ROOT);
const CATALOG_TOOLS = new Set(CATALOG.map((tool) => tool.name));
const BACKEND_REGISTRY = REPO_REQUIRE ? REPO_REQUIRE('./backend/src/services/mcpToolRegistry.js') : null;
const CALLER_IDENTITY = REPO_REQUIRE ? REPO_REQUIRE('./mcp/callerIdentity.cjs') : null;
let callerIdentityInitialization;

const CLI_TOOL_NAMES = new Set([
  'genos_snapshot', 'genos_replay', 'genos_capsule_create', 'genos_merge',
  'genos_audit', 'genos_biomimicry', 'genos_v2_init', 'genos_v2_fork'
]);
const STRATEGY_TOOL_NAMES = new Set(['genos_execute_primitive', 'genos_execute_strategy_pipeline']);
const ORCHESTRATOR_ACTIONS = Object.freeze({
  genos_orchestrate: 'orchestrate',
  genos_delegate_worker: 'dispatch_worker',
  genos_change_strategy: 'change_strategy',
  genos_report_progress: 'report_progress',
  genos_change_organization: 'change_organization',
  genos_organization_state: 'organization_state',
  genos_worker_status: 'worker_status',
  genos_worker_publish: 'organization_publish',
  genos_worker_inbox: 'organization_inbox',
  genos_trinity_launch: 'dispatch_trinity',
  genos_a_team_preview: 'dispatch_team',
  genos_biological_mode: 'dispatch_biological',
  genos_philosophy: 'philosophy'
});

function hasBackendRoute(name) {
  return Boolean(BACKEND_REGISTRY && CATALOG_TOOLS.has(name) && BACKEND_REGISTRY.isSupportedTool(name));
}

export function isToolCallRoutable(name) {
  if (name === 'genos_philosophy' && !HAS_BACKEND_RUNTIME) return false;
  if (hasBackendRoute(name)) return true;
  return STRATEGY_TOOL_NAMES.has(name) || CLI_TOOL_NAMES.has(name)
    || Object.prototype.hasOwnProperty.call(ORCHESTRATOR_ACTIONS, name);
}

export function filterRoutableTools(tools) {
  return tools.filter((tool) => isToolCallRoutable(tool.name));
}
function strategyCall({ name, args, executeStrategyTool }) {
  const strategyArgs = name === 'genos_execute_primitive'
    ? { ...args, primitive: args.primitive || args.primitive_name || args.name || (Array.isArray(args.primitives) ? 'pipeline' : '') }
    : args;
  const context = { agentId: process.env.GENOS_AGENT_ID || null };
  return executeStrategyTool(name, strategyArgs, context).then((execution) => {
    if (!execution) throw new Error('Strategy tool is unavailable.');
    if (!execution.success) throw new Error(execution.output?.error || 'Strategy tool execution failed.');
    return JSON.stringify(execution.output);
  });
}

async function registeredToolCall({ name, args }) {
  const agentId = process.env.GENOS_AGENT_ID || null;
  const { kind, result } = await REPO_REQUIRE('./backend/src/services/mcpToolRegistry.js')
    .dispatchTool(name, args, agentId ? { agentId } : {});
  if (kind === 'unsupported' || !result?.success) {
    throw new Error(result?.error || `MCP tool '${name}' failed.`);
  }
  return JSON.stringify(result.output ?? result);
}

function withBiomimicryParams(command, args) {
  if (args.toolName !== 'genos_biomimicry') return command;
  const params = args.params && typeof args.params === 'object' ? args.params : {};
  return Object.entries(params).reduce(
    (acc, [key, value]) => acc.concat(['--param', `${key}=${value}`]),
    command
  );
}

async function cliCall({ args, runGenosCli }) {
  if (args.toolName === 'genos_replay') await assertOwnWorkerReplay(args.snapshot || args.snapshot_id);
  const command = buildCliCommand(args);
  if (!command) throw new Error(`Unsupported CLI tool '${args.toolName}'.`);
  const text = await runGenosCli(withBiomimicryParams(command, args), args);
  if (!text || !String(text).trim()) throw new Error(`CLI tool '${args.toolName}' returned empty output.`);
  const result = parseCliOutput(text);
  if (result?.success === false) throw new Error(result.error || 'CLI operation was not completed.');
  return text;
}

function buildCliCommand(args) {
  const builders = {
    genos_snapshot: (input) => ['snapshot', 'create', '--agent', input.agent, '--out', input.out, '--force'],
    genos_replay: (input) => ['replay', 'basic', '--snapshot', input.snapshot || input.snapshot_id],
    genos_capsule_create: (input) => ['capsule', 'create', '--snapshot', input.snapshot_id, ...(input.seed ? ['--seed', input.seed] : [])],
    genos_merge: (input) => ['merge', input.branch_id, ...(input.conditions ? ['--conditions', input.conditions] : [])],
    genos_audit: (input) => ['audit', input.snapshot_id, '--output', input.output || 'audit.log'],
    genos_biomimicry: (input) => ['biomimicry', 'bio-feature', '--feature', input.feature, '--action', input.action],
    genos_v2_init: () => ['init'],
    genos_v2_fork: (input) => ['agent', 'fork', '--parent-id', input.parent_id]
  };
  return builders[args.toolName]?.(args);
}

async function assertOwnWorkerReplay(reference) {
  const agentId = String(process.env.GENOS_AGENT_ID || '').trim();
  if (!agentId || !HAS_BACKEND_RUNTIME) throw new Error('Worker identity is required to replay a capsule.');
  const db = await REPO_REQUIRE('./backend/src/db').getDatabase();
  const owns = await REPO_REQUIRE('./backend/src/services/agents/workerContractEnforcement')
    .ownsReplaySnapshot(db, agentId, reference);
  if (!owns) throw new Error('Workers may replay only their own evidence capsule.');
}

function parseCliOutput(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function isStructuredResult(result) {
  return result && typeof result === 'object' && !Array.isArray(result)
    && Object.keys(result).length > 0;
}

function orchestratorRequest(action, args) {
  if (args.orchestrator_id && args.orchestratorId && args.orchestrator_id !== args.orchestratorId) {
    throw new Error('Conflicting orchestrator identifiers.');
  }
  const requested = args.orchestrator_id || args.orchestratorId;
  const scopedOrganizationAction = ['organization_state', 'worker_status', 'organization_inbox', 'organization_publish'].includes(action);
  const orchestratorId = requested || (scopedOrganizationAction
    ? process.env.GENOS_ORCHESTRATOR_AGENT_ID || process.env.GENOS_AGENT_ID : undefined);
  return { action, ...args, ...(orchestratorId ? { orchestrator_id: orchestratorId, orchestratorId } : {}) };
}

async function orchestratorCall({ name, args, runOrchestrator, onTelemetry }) {
  // Fail-closed: un outil sans pont dedie est refuse explicitement au lieu
  // d'etre envoye vers une orchestration generique.
  const action = ORCHESTRATOR_ACTIONS[name];
  if (!action) throw new Error(`Tool '${name}' has no verified MCP route.`);
  const request = orchestratorRequest(action, args);
  configureBiocenoseExecution(name, args, request);
  if (request.background === undefined
    && (name === 'genos_orchestrate' || name === 'genos_delegate_worker' || name === 'genos_biological_mode')) {
    request.background = true;
  }
  const text = await runOrchestrator(request, { onTelemetry });
  const result = parseCliOutput(text);
  if (!isStructuredResult(result)) {
    throw new Error(`Orchestrator action '${name}' returned no structured result.`);
  }
  assertOrchestratorResult(name, result);
  return text;
}

function configureBiocenoseExecution(name, args, request) {
  if (name === 'genos_biological_mode' && (args.execute_round === true || args.community_id)) {
    request.background = false;
  }
}

function assertOrchestratorResult(name, result) {
  if (result?.success !== false) return;
  throw new Error(name === 'genos_biological_mode' ? JSON.stringify(result)
    : result.error || `Orchestrator action '${name}' failed.`);
}

async function philosophyCall(args) {
  const operation = String(args.operation || '').trim();
  const operationArgs = args.arguments && typeof args.arguments === 'object' ? args.arguments : {};
  if (operation === 'saveAnalysis') throw new Error('genos_philosophy does not allow persistence writes.');
  if (operation === 'applyRuntimeEffect' && operationArgs.apply === true) {
    throw new Error('genos_philosophy only allows runtime effect previews.');
  }
  const { default: philosophyRouter } = await import('../backend/src/services/philosophyRouter.js');
  const result = await philosophyRouter.handlePhilosophyRequest({ request: { operation, arguments: operationArgs } });
  return JSON.stringify(result);
}

export function createToolCallHandler({ runOrchestrator, runGenosCli, executeStrategyTool }) {
  return (request, extra = {}) => handleToolRequest({ request, extra, runOrchestrator, runGenosCli, executeStrategyTool });
}

async function handleToolRequest(input) {
  const { request, extra, runOrchestrator, runGenosCli, executeStrategyTool } = input;
  const { name, arguments: args = {} } = request.params;
  if (CATALOG_TOOLS.has(name) && !toolIsLeased(name, CATALOG)) {
    return { content: [{ type: 'text', text: `Tool '${name}' is outside the active GenOS MCP lease.` }], isError: true };
  }
  const onTelemetry = telemetryHandler(request, extra);
  let actor = null;
  try {
    if (requiresCallerIdentity(name)) await ensureMcpCallerIdentity();
    actor = await beginActorCall(name);
    const text = await dispatchWithActor({ actor, name, args, onTelemetry,
      runOrchestrator, runGenosCli, executeStrategyTool });
    return { content: [{ type: 'text', text }],
      _meta: { 'genos.body': bodyMetadata(actor) } };
  } catch (error) {
    return { content: [{ type: 'text', text: error.message }], isError: true,
      _meta: { 'genos.body': bodyMetadata(actor) } };
  }
}

function requiresCallerIdentity(name) {
  return process.env.GENOS_CODEX_AUTO_PROVISION_IDENTITY === '1'
    || new Set(['genos_organization_state', 'genos_worker_status', 'genos_worker_inbox', 'genos_worker_publish', 'genos_biological_mode']).has(name);
}

function ensureMcpCallerIdentity() {
  if (!callerIdentityInitialization) callerIdentityInitialization = initializeMcpCallerIdentity();
  return callerIdentityInitialization;
}

async function initializeMcpCallerIdentity() {
  if (!REPO_REQUIRE || !CALLER_IDENTITY) throw new Error('GenOS caller identity provisioning requires the local backend runtime.');
  const workspaceRoot = path.resolve(process.env.GENOS_WORKSPACE_ROOT || process.env.GENOS_REPO_ROOT || process.cwd());
  process.env.GENOS_WORKSPACE_ROOT = workspaceRoot;
  const db = await REPO_REQUIRE('./backend/src/db').getDatabase();
  const identity = await CALLER_IDENTITY.ensureCallerIdentity(db, { workspaceRoot });
  process.env.GENOS_AGENT_ID = identity.agentId;
  if (identity.orchestratorId) process.env.GENOS_ORCHESTRATOR_AGENT_ID = identity.orchestratorId;
  return identity;
}

async function dispatchWithActor(input) {
  const { actor, ...dispatchInput } = input;
  let text;
  try {
    text = await dispatchTool(dispatchInput);
  } catch (error) {
    if (actor) await finishActorCall(actor, false, error.message);
    throw error;
  }
  await finishActorCall(actor, true, text);
  return text;
}

function telemetryHandler(request, extra) {
  const progressToken = request.params?._meta?.progressToken;
  if (progressToken === undefined || !extra.sendNotification) return undefined;
  let progress = 0;
  return (event) => extra.sendNotification({
    method: 'notifications/progress',
    params: {
      progress: ++progress,
      progressToken,
      message: JSON.stringify({ type: 'telemetry', event })
    }
  });
}

async function dispatchTool(input) {
  const { name, args, onTelemetry, runOrchestrator, runGenosCli, executeStrategyTool } = input;
  if (DEVELOPMENT?.isDevelopmentTool(name) && CATALOG_TOOLS.has(name)) {
    const context = { agentId: process.env.GENOS_AGENT_ID || null };
    return JSON.stringify(await DEVELOPMENT.executeDevelopmentTool(name, args, context));
  }
  if (name === 'genos_philosophy') return philosophyCall(args);
  if (STRATEGY_TOOL_NAMES.has(name)) return strategyCall({ name, args, executeStrategyTool });
  if (CLI_TOOL_NAMES.has(name)) {
    const argumentError = validateCliArguments(name, args);
    if (argumentError) throw new Error(argumentError);
    return cliCall({ args: { ...args, toolName: name }, runGenosCli });
  }
  if (Object.prototype.hasOwnProperty.call(ORCHESTRATOR_ACTIONS, name)) {
    return orchestratorCall({ name, args, runOrchestrator, onTelemetry });
  }
  if (hasBackendRoute(name)) {
    return registeredToolCall({ name, args });
  }
  return orchestratorCall({ name, args, runOrchestrator, onTelemetry });
}
