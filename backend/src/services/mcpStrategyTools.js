/**
 * GenOS MCP Strategy Tools — Direct execution bridge for the registered strategy and primitive sets.
 */
const strategyExecutionAdapter = require('./strategyExecutionAdapter');
const { validateToolArguments } = require('./mcpArgumentValidation');
const { MCP_TOOLS_LIST } = require('../db/seedTools');
const { annotateCapability } = require('./capabilityMaturity');

const REGISTERED_STRATEGY_TOOLS = new Set((MCP_TOOLS_LIST || []).map((tool) => tool.name).filter((name) => name.startsWith('genos_strat_')));

const EXTRA_STRATEGY_TOOLS = new Set([
  'genos_resilience_hypermutation',
  'genos_execute_primitive',
  'genos_execute_strategy_pipeline',
  'genos_record_experience',
  'genos_compile_memory',
  'genos_synaptic_stdp_update',
  'genos_synaptic_prune_scale',
  'genos_blame',
  'genos_lineage',
  'genos_procedural_registry_list',
  'genos_procedural_runner_resolve'
]);

function isStrategyTool(toolName) {
  if (!toolName || typeof toolName !== 'string') return false;
  return REGISTERED_STRATEGY_TOOLS.has(toolName) || EXTRA_STRATEGY_TOOLS.has(toolName);
}

function firstTruthy(...values) {
  for (const value of values) {
    if (value) return value;
  }
  return undefined;
}

function nullish(value, fallback) {
  return value === undefined || value === null ? fallback : value;
}

function strategyOutput(success, output) {
  return { configured: true, success, status: success ? 'completed' : 'tool_error', transport: 'strategy_primitive', output };
}

function primitiveSuccess(res) {
  return Boolean(res && res.success !== false);
}

async function runPrimitive(primitive, args) {
  const res = await strategyExecutionAdapter.executePrimitive(primitive, args);
  return strategyOutput(primitiveSuccess(res), annotateCapability(primitive, res));
}

async function runPipeline(primitives, context) {
  const res = await strategyExecutionAdapter.executePipelineWithFeedback(primitives, context);
  return strategyOutput(primitiveSuccess(res), res);
}

function incompleteProvenance(toolName, targetId, error) {
  return strategyOutput(false, {
    tool: toolName, targetId, error, evidence: [],
    provenance: { source: 'sqlite', complete: false, truncated: false }
  });
}

async function resolveWorkspaceScope({ db, agentId, toolName, targetId }) {
  if (!agentId) return null;
  const caller = await db.get(`SELECT a.workspace_id, w.organization_id, w.project_id
    FROM agents a LEFT JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ?`, agentId);
  if (!caller || !caller.workspace_id) return null;
  const table = toolName === 'genos_blame' ? 'agents' : 'lineage_nodes';
  const target = await db.get(`SELECT workspace_id FROM ${table} WHERE id = ?`, targetId);
  return target && target.workspace_id === caller.workspace_id ? caller : null;
}

async function queryBlame(db, targetId, scope) {
  const tenantClause = scope.organization_id || scope.project_id
    ? '((organization_id IS ? AND project_id IS ?) OR (organization_id IS NULL AND project_id IS NULL))'
    : '(organization_id IS NULL AND project_id IS NULL)';
  const params = scope.organization_id || scope.project_id
    ? [targetId, scope.organization_id || null, scope.project_id || null]
    : [targetId];
  return db.all(`SELECT event_id, event_type, action, detail, payload_json, created_at
    FROM telemetry_events WHERE agent_id = ? AND ${tenantClause} ORDER BY created_at, id LIMIT 1001`, ...params);
}

async function queryLineage(db, targetId, workspaceId) {
  return db.all(`WITH RECURSIVE ancestors(id, depth) AS (
      SELECT e.source_node_id, 1 FROM lineage_edges e
      JOIN lineage_nodes target ON target.id = e.target_node_id
      JOIN lineage_nodes source ON source.id = e.source_node_id
      WHERE e.target_node_id = ? AND target.workspace_id = ? AND source.workspace_id = ?
        AND (e.workspace_id = ? OR e.workspace_id IS NULL)
      UNION ALL
      SELECT e.source_node_id, ancestors.depth + 1 FROM lineage_edges e
      JOIN ancestors ON e.target_node_id = ancestors.id
      JOIN lineage_nodes source ON source.id = e.source_node_id
      JOIN lineage_nodes target ON target.id = e.target_node_id
      WHERE source.workspace_id = ? AND target.workspace_id = ?
        AND (e.workspace_id = ? OR e.workspace_id IS NULL)
      LIMIT 1001
    ) SELECT id, depth FROM ancestors ORDER BY depth, id`,
  targetId, workspaceId, workspaceId, workspaceId, workspaceId, workspaceId, workspaceId);
}

async function handleBlameOrLineage(toolName, args, context) {
  const targetId = firstTruthy(args.target_id, args.targetId);
  if (!targetId) return strategyOutput(false, { error: 'target_id is required.' });
  try {
    const { getDatabase } = require('../db');
    const db = await getDatabase();
    const workspaceId = await resolveWorkspaceScope({
      db, agentId: context.agentId, toolName, targetId
    });
    if (!workspaceId) return incompleteProvenance(toolName, targetId, 'Caller or target is outside the available workspace scope.');
    const rows = toolName === 'genos_blame'
      ? await queryBlame(db, targetId, workspaceId)
      : await queryLineage(db, targetId, workspaceId.workspace_id);
    const truncated = rows.length > 1000;
    const evidence = rows.slice(0, 1000);
    const complete = evidence.length > 0 && !truncated;
    return strategyOutput(complete, {
      tool: toolName, targetId, evidence, truncated,
      provenance: { source: 'sqlite', complete, truncated, verifiedAt: new Date().toISOString() }
    });
  } catch (error) {
    return strategyOutput(false, { tool: toolName, targetId, error: error.message, evidence: [] });
  }
}

async function handleResilienceHypermutation(args) {
  if (args.genes && typeof args.genes === 'object') {
    const genetics = require('./geneticsService');
    const result = genetics.somaticHypermutate(args.genes, {
      seed: args.seed,
      mutationRate: args.mutationRate,
      stressLevel: args.stressLevel
    });
    return { configured: true, success: true, status: 'completed', transport: 'strategy_primitive', output: result };
  }
  const mutations = Array.isArray(args.mutations) ? args.mutations : [];
  return runPrimitive('mutate', {
    ...args,
    agentId: firstTruthy(args.agentId, args.agent_id),
    orchestratorId: firstTruthy(args.orchestratorId, args.orchestrator_id),
    mutations,
    hypermutation: true,
    mutationRate: nullish(args.mutationRate, 0.35)
  });
}

async function handleSynapticStdpUpdate(args) {
  const primitiveArgs = {
    sourceId: firstTruthy(args.source_id, args.sourceId, args.causeId),
    targetId: firstTruthy(args.target_id, args.targetId, args.effectId),
    preSpikeAt: firstTruthy(args.pre_spike_at, args.preSpikeAt),
    postSpikeAt: firstTruthy(args.post_spike_at, args.postSpikeAt),
    learningRate: firstTruthy(args.learning_rate, args.learningRate),
    transmitterType: firstTruthy(args.transmitter_type, args.transmitterType),
    agentId: firstTruthy(args.agent_id, args.agentId),
  };
  return runPrimitive('stdp_update', primitiveArgs);
}

async function callerWorkspace(db, agentId) {
  if (!agentId) return null;
  const agent = await db.get('SELECT workspace_id FROM agents WHERE id = ?', agentId);
  if (!agent?.workspace_id) return null;
  const workspace = await db.get('SELECT id, organization_id, project_id FROM workspaces WHERE id = ?', agent.workspace_id);
  return workspace || null;
}

function synapsePruneQuery(scope, threshold) {
  const sql = `DELETE FROM memory_synapses
    WHERE (ABS(weight) < ? OR (c3_opsonization > 0.5 AND cd47_expression < 0.5))
      AND source_id IN (SELECT d.id FROM genome_decisions d JOIN agents a ON a.id = d.created_by WHERE a.workspace_id = ?)
      AND target_id IN (SELECT d.id FROM genome_decisions d JOIN agents a ON a.id = d.created_by WHERE a.workspace_id = ?)
      AND (organization_id = ? OR organization_id IS NULL)
      AND (project_id = ? OR project_id IS NULL)`;
  const params = [threshold, scope.id, scope.id, scope.organization_id, scope.project_id];
  return { sql, params };
}

async function handleSynapticPruneScale(args, context) {
  const { getDatabase } = require('../db');
  const db = await getDatabase();
  const threshold = Number(nullish(args.threshold, 0.1)) * Number(nullish(args.scale, 1.0));
  const agentId = context.agentId;
  const scope = await callerWorkspace(db, agentId);
  if (!scope) return { configured: false, success: false, status: 'scope_denied', code: 'MCP_WORKSPACE_SCOPE_REQUIRED' };
  let prunedCount = 0;
  if (db) {
    const { sql, params } = synapsePruneQuery(scope, threshold);
    const res = await db.run(sql, ...params);
    prunedCount = res && res.changes ? res.changes : 0;
  }
  return {
    configured: true,
    success: true,
    status: 'completed',
    transport: 'strategy_primitive',
    output: { success: true, prunedSynapses: prunedCount, threshold, agent_id: agentId }
  };
}

async function handleExecutePrimitive(args) {
  if (Array.isArray(args.primitives) || Array.isArray(args.pipeline)) {
    const primitives = firstTruthy(args.primitives, args.pipeline) || [];
    return runPipeline(primitives, firstTruthy(args.context, args));
  }
  const primitive = firstTruthy(args.primitive, args.primitive_name, args.name) || '';
  return runPrimitive(primitive, firstTruthy(args.args, args.context, args));
}

async function handleExecuteStrategyPipeline(args) {
  const primitives = firstTruthy(args.primitives, args.pipeline) || [];
  return runPipeline(primitives, firstTruthy(args.context, args));
}

async function handleProceduralRegistryList(args) {
  const { run } = require('../bin/genos-registry-tool.cjs');
  return run('list-runners', args);
}

async function handleProceduralRunnerResolve(args) {
  const { run } = require('../bin/genos-registry-tool.cjs');
  return run('resolve-runner', args);
}

const STRATEGY_HANDLERS = {
  genos_blame: (args, context) => handleBlameOrLineage('genos_blame', args, context),
  genos_lineage: (args, context) => handleBlameOrLineage('genos_lineage', args, context),
  genos_record_experience: (args) => runPrimitive('record_experience', args),
  genos_compile_memory: (args) => runPrimitive('compile_memory', args),
  genos_resilience_hypermutation: handleResilienceHypermutation,
  genos_synaptic_stdp_update: handleSynapticStdpUpdate,
  genos_synaptic_prune_scale: (args, context) => handleSynapticPruneScale(args, context),
  genos_execute_primitive: handleExecutePrimitive,
  genos_execute_strategy_pipeline: handleExecuteStrategyPipeline,
  genos_procedural_registry_list: handleProceduralRegistryList,
  genos_procedural_runner_resolve: handleProceduralRunnerResolve
};

async function dispatchStrategyTool(toolName, args, context) {
  if (toolName.startsWith('genos_strat_')) {
    return runPrimitive(toolName.slice('genos_strat_'.length), args);
  }
  const handler = STRATEGY_HANDLERS[toolName];
  return handler ? handler(args, context) : null;
}

async function executeStrategyTool(toolName, args = {}, context = {}) {
  if (!isStrategyTool(toolName)) return null;
  const argumentError = validateToolArguments(toolName, args);
  if (argumentError) return { configured: true, success: false, status: 'invalid_args', error: argumentError.message, code: argumentError.code };
  try {
    return await dispatchStrategyTool(toolName, args, context);
  } catch (err) {
    return {
      configured: true,
      success: false,
      status: 'tool_error',
      transport: 'strategy_primitive',
      output: { success: false, error: err.message }
    };
  }
}

module.exports = {
  isStrategyTool,
  executeStrategyTool
};
