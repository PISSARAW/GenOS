/**
 * GenOS MCP Strategy Tools — Direct execution bridge for 79 strategies and 189 referenced primitives.
 */
const strategyExecutionAdapter = require('./strategyExecutionAdapter');
const { validateToolArguments } = require('./mcpArgumentValidation');
const { MCP_TOOLS_LIST } = require('../db/seedTools');

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
  'genos_lineage'
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
  return strategyOutput(primitiveSuccess(res), res);
}

async function runPipeline(primitives, context) {
  const res = await strategyExecutionAdapter.executePipelineWithFeedback(primitives, context);
  return strategyOutput(primitiveSuccess(res), res);
}

function handleBlameOrLineage(toolName, args) {
  return {
    configured: true,
    success: true,
    status: 'completed',
    transport: 'strategy_primitive',
    output: {
      tool: toolName,
      targetId: firstTruthy(args.target_id, args.targetId) || null,
      evidence: [],
      provenance: { source: 'local_strategy_bridge', complete: false }
    }
  };
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

function synapseTenantClauses(agentId, orgId, projId) {
  let where = '';
  const params = [];
  if (agentId && agentId !== 'global' && agentId !== 'default-agent') {
    where += ' AND (source_id IN (SELECT id FROM genome_decisions WHERE created_by = ?) OR target_id IN (SELECT id FROM genome_decisions WHERE created_by = ?))';
    params.push(agentId, agentId);
  }
  if (orgId) {
    where += ' AND (organization_id = ? OR organization_id IS NULL)';
    params.push(orgId);
  }
  if (projId) {
    where += ' AND (project_id = ? OR project_id IS NULL)';
    params.push(projId);
  }
  return { where, params };
}

async function handleSynapticPruneScale(args) {
  const { getDatabase } = require('../db');
  const db = await getDatabase();
  const threshold = Number(nullish(args.threshold, 0.1)) * Number(nullish(args.scale, 1.0));
  const agentId = firstTruthy(args.agent_id, args.agentId);
  const orgId = firstTruthy(args.organization_id, args.organizationId);
  const projId = firstTruthy(args.project_id, args.projectId);
  let prunedCount = 0;
  if (db) {
    const { where, params } = synapseTenantClauses(agentId, orgId, projId);
    const sql = 'DELETE FROM memory_synapses WHERE (ABS(weight) < ? OR (c3_opsonization > 0.5 AND cd47_expression < 0.5))' + where;
    const res = await db.run(sql, threshold, ...params);
    prunedCount = res && res.changes ? res.changes : 0;
  }
  return {
    configured: true,
    success: true,
    status: 'completed',
    transport: 'strategy_primitive',
    output: { success: true, prunedSynapses: prunedCount, threshold, agent_id: agentId || 'global' }
  };
}

async function handleExecutePrimitive(args) {
  if (Array.isArray(args.primitives) || Array.isArray(args.pipeline)) {
    const primitives = firstTruthy(args.primitives, args.pipeline) || [];
    return runPipeline(primitives, firstTruthy(args.context, args));
  }
  const primitive = firstTruthy(args.primitive, args.primitive_name, args.name) || '';
  return runPrimitive(primitive, firstTruthy(args.context, args));
}

function handleExecuteStrategyPipeline(args) {
  const primitives = firstTruthy(args.primitives, args.pipeline) || [];
  return runPipeline(primitives, firstTruthy(args.context, args));
}

const STRATEGY_HANDLERS = {
  genos_blame: (args) => handleBlameOrLineage('genos_blame', args),
  genos_lineage: (args) => handleBlameOrLineage('genos_lineage', args),
  genos_record_experience: (args) => runPrimitive('record_experience', args),
  genos_compile_memory: (args) => runPrimitive('compile_memory', args),
  genos_resilience_hypermutation: handleResilienceHypermutation,
  genos_synaptic_stdp_update: handleSynapticStdpUpdate,
  genos_synaptic_prune_scale: handleSynapticPruneScale,
  genos_execute_primitive: handleExecutePrimitive,
  genos_execute_strategy_pipeline: handleExecuteStrategyPipeline
};

async function dispatchStrategyTool(toolName, args) {
  if (toolName.startsWith('genos_strat_')) {
    return runPrimitive(toolName.slice('genos_strat_'.length), args);
  }
  const handler = STRATEGY_HANDLERS[toolName];
  return handler ? handler(args) : null;
}

async function executeStrategyTool(toolName, args = {}) {
  if (!isStrategyTool(toolName)) return null;
  const argumentError = validateToolArguments(toolName, args);
  if (argumentError) return { configured: true, success: false, status: 'invalid_args', error: argumentError.message, code: argumentError.code };
  try {
    return await dispatchStrategyTool(toolName, args);
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
