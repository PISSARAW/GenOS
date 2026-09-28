import { validateCliArguments } from "./argumentValidation.js";
import { resolveRepoRoot } from "./repoRoot.js";

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
  return async (request, extra = {}) => {
    const { name, arguments: args = {} } = request.params;
    const progressToken = request.params?._meta?.progressToken;
    let progress = 0;
    const onTelemetry = progressToken === undefined || !extra.sendNotification
      ? undefined
      : (event) => extra.sendNotification({
        method: 'notifications/progress',
        params: {
          progress: ++progress,
          progressToken,
          message: JSON.stringify({ type: 'telemetry', event })
        }
      });
    try {
      if (name === 'genos_philosophy') {
        return { content: [{ type: 'text', text: await philosophyCall(args) }] };
      }
      if (STRATEGY_TOOL_NAMES.has(name)) return { content: [{ type: 'text', text: await strategyCall({ name, args, executeStrategyTool }) }] };
      if (CLI_TOOL_NAMES.has(name)) {
        const argumentError = validateCliArguments(name, args);
        if (argumentError) return { content: [{ type: 'text', text: argumentError }], isError: true };
        return { content: [{ type: 'text', text: await cliCall({ args: { ...args, toolName: name }, runGenosCli }) }] };
      }
      return { content: [{ type: 'text', text: await orchestratorCall({ name, args, runOrchestrator, onTelemetry }) }] };
    } catch (error) {
      return { content: [{ type: 'text', text: error.message }], isError: true };
    }
  };
}
