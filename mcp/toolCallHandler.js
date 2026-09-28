import { validateCliArguments } from "./argumentValidation.js";
import { resolveRepoRoot } from "./repoRoot.js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const CATALOG_TOOLS = new Set(require('../shared/toolDefinitions.json').tools.map((tool) => tool.name));
const { MCP_TOOLS_LIST } = require('../backend/src/db/seedTools.js');
const REGISTERED_TOOL_NAMES = new Set(MCP_TOOLS_LIST.map((tool) => tool.name));
const BACKEND_BRIDGED_TOOL_NAMES = new Set([
  'genos_fossil_record', 'genos_fossil_list', 'genos_fossil_strata', 'genos_fossil_excavate',
  'genos_fossil_decode', 'genos_fossil_candidate', 'genos_topology_session', 'genos_signal_publish',
  'genos_signal_read', 'genos_signal_purge', 'genos_signal_ground', 'genos_signal_electrocyte_vote',
  'genos_signal_chemotactic_follow', 'genos_signal_plasmid_transfer', 'genos_signal_collective_decision'
]);

const CLI_TOOL_NAMES = new Set([
  'genos_snapshot', 'genos_replay', 'genos_capsule_create', 'genos_merge',
  'genos_audit', 'genos_biomimicry', 'genos_v2_init', 'genos_v2_fork'
]);
const STRATEGY_TOOL_NAMES = new Set(['genos_execute_primitive', 'genos_execute_strategy_pipeline']);
const HAS_BACKEND_RUNTIME = Boolean(resolveRepoRoot());
const ORCHESTRATOR_ACTIONS = Object.freeze({
  genos_orchestrate: 'orchestrate',
  genos_delegate_worker: 'dispatch_worker',
  genos_change_strategy: 'change_strategy',
  genos_report_progress: 'report_progress',
  genos_change_organization: 'change_organization',
  genos_organization_state: 'organization_state',
  genos_worker_publish: 'organization_publish',
  genos_worker_inbox: 'organization_inbox',
  genos_trinity_launch: 'dispatch_trinity',
  genos_a_team_preview: 'dispatch_team',
  genos_biological_mode: 'dispatch_biological',
  genos_philosophy: 'philosophy'
});

export function isToolCallRoutable(name) {
  if (name === 'genos_philosophy' && !HAS_BACKEND_RUNTIME) return false;
  if (HAS_BACKEND_RUNTIME && CATALOG_TOOLS.has(name)
    && (REGISTERED_TOOL_NAMES.has(name) || BACKEND_BRIDGED_TOOL_NAMES.has(name))) return true;
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
  return executeStrategyTool(name, strategyArgs).then((execution) => {
    if (!execution) throw new Error('Strategy tool is unavailable.');
    if (!execution.success) throw new Error(execution.output?.error || 'Strategy tool execution failed.');
    return JSON.stringify(execution.output);
  });
}

async function registeredToolCall({ name, args }) {
  const { kind, result } = await require('../backend/src/services/mcpToolRegistry.js').dispatchTool(name, args);
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

function cliCall({ args, runGenosCli }) {
  const commands = {
    genos_snapshot: ['snapshot', 'create', '--agent', args.agent, '--out', args.out, '--force'],
    genos_replay: ['replay', 'basic', '--snapshot', args.snapshot || args.snapshot_id],
    genos_capsule_create: ['capsule', 'create', '--snapshot', args.snapshot_id || 'ROOT', ...(args.seed ? ['--seed', args.seed] : [])],
    genos_merge: ['merge', args.branch_id, ...(args.conditions ? ['--conditions', args.conditions] : [])],
    genos_audit: ['audit', args.snapshot_id, '--output', args.output || 'audit.log'],
    genos_biomimicry: ['biomimicry', 'bio-feature', '--feature', args.feature, '--action', args.action],
    genos_v2_init: ['init'],
    genos_v2_fork: ['agent', 'fork', '--parent-id', args.parent_id || 'ROOT']
  };
  const command = commands[args.toolName];
  if (!command) throw new Error(`Unsupported CLI tool '${args.toolName}'.`);
  return runGenosCli(withBiomimicryParams(command, args), args);
}

function orchestratorCall({ name, args, runOrchestrator, onTelemetry }) {
  // Fail-closed: un outil sans pont dedie est refuse explicitement au lieu
  // d'etre envoye vers une orchestration generique.
  const action = ORCHESTRATOR_ACTIONS[name];
  if (!action) throw new Error(`Tool '${name}' has no verified MCP route.`);
  const request = { action, ...args };
  if (name === 'genos_delegate_worker') request.background = false;
  if (name === 'genos_orchestrate' && request.background === undefined) request.background = false;
  return runOrchestrator(request, { onTelemetry });
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
  const onTelemetry = telemetryHandler(request, extra);
  try {
    const text = await dispatchTool({ name, args, onTelemetry, runOrchestrator, runGenosCli, executeStrategyTool });
    return { content: [{ type: 'text', text }] };
  } catch (error) {
    return { content: [{ type: 'text', text: error.message }], isError: true };
  }
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
  if (HAS_BACKEND_RUNTIME && CATALOG_TOOLS.has(name)) return registeredToolCall({ name, args });
  return orchestratorCall({ name, args, runOrchestrator, onTelemetry });
}
