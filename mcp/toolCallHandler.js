import { validateCliArguments } from "./argumentValidation.js";

function primitiveCall({ args, executeStrategyTool }) {
  const primitiveArgs = { ...args, primitive: args.primitive || args.primitive_name || args.name || (Array.isArray(args.primitives) ? 'pipeline' : '') };
  return executeStrategyTool('genos_execute_primitive', primitiveArgs).then((execution) => {
    if (!execution) throw new Error('Strategy tool is unavailable.');
    if (!execution.success) throw new Error(execution.output?.error || 'Primitive execution failed.');
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
    genos_replay: ['replay', 'basic', '--snapshot', args.snapshot],
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
  const actions = {
    genos_orchestrate: { action: 'orchestrate' },
    genos_delegate_worker: { action: 'dispatch_worker', background: false },
    genos_change_strategy: { action: 'change_strategy' },
    genos_report_progress: { action: 'report_progress' },
    genos_change_organization: { action: 'change_organization' },
    genos_organization_state: { action: 'organization_state' },
    genos_worker_publish: { action: 'organization_publish' },
    genos_worker_inbox: { action: 'organization_inbox' },
    genos_trinity_launch: { action: 'dispatch_trinity' },
    genos_a_team_preview: { action: 'dispatch_team' },
    genos_biological_mode: { action: 'dispatch_biological' },
    genos_philosophy: { action: 'philosophy' }
  };
  const request = { ...actions[name], ...args };
  if (name === 'genos_orchestrate' && request.background === undefined) request.background = false;
  return runOrchestrator(request, { onTelemetry });
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
      if (name === 'genos_execute_primitive') return { content: [{ type: 'text', text: await primitiveCall({ args, executeStrategyTool }) }] };
      if (name.startsWith('genos_v2_') || ['genos_snapshot', 'genos_replay', 'genos_capsule_create', 'genos_merge', 'genos_audit', 'genos_biomimicry'].includes(name)) {
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
