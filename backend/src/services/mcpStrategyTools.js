/**
 * GenOS MCP Strategy Tools — Direct execution bridge for 79 strategies and 189 referenced primitives.
 */
const strategyExecutionAdapter = require('./strategyExecutionAdapter');
const { validateToolArguments } = require('./mcpArgumentValidation');
const { MCP_TOOLS_LIST } = require('../db/seedTools');

const REGISTERED_STRATEGY_TOOLS = new Set((MCP_TOOLS_LIST || []).map((tool) => tool.name).filter((name) => name.startsWith('genos_strat_')));

function isStrategyTool(toolName) {
  if (!toolName || typeof toolName !== 'string') return false;
  return (
    REGISTERED_STRATEGY_TOOLS.has(toolName) ||
    toolName === 'genos_resilience_hypermutation' ||
    toolName === 'genos_execute_primitive' ||
    toolName === 'genos_execute_strategy_pipeline' ||
    toolName === 'genos_record_experience' ||
    toolName === 'genos_compile_memory' ||
    toolName === 'genos_synaptic_stdp_update' ||
    toolName === 'genos_synaptic_prune_scale'
    || toolName === 'genos_blame'
    || toolName === 'genos_lineage'
  );
}

async function executeStrategyTool(toolName, args = {}) {
  if (!isStrategyTool(toolName)) return null;
  const argumentError = validateToolArguments(toolName, args);
  if (argumentError) return { configured: true, success: false, status: 'invalid_args', error: argumentError.message, code: argumentError.code };

  try {
    if (toolName === 'genos_blame' || toolName === 'genos_lineage') {
      return {
        configured: true,
        success: true,
        status: 'completed',
        transport: 'strategy_primitive',
        output: {
          tool: toolName,
          targetId: args.target_id || args.targetId || null,
          evidence: [],
          provenance: { source: 'local_strategy_bridge', complete: false }
        }
      };
    }
    if (toolName === 'genos_record_experience') {
      const res = await strategyExecutionAdapter.executePrimitive('record_experience', args);
      const ok = res && res.success !== false;
      return {
        configured: true,
        success: ok,
        status: ok ? 'completed' : 'tool_error',
        transport: 'strategy_primitive',
        output: res
      };
    }
    if (toolName === 'genos_compile_memory') {
      const res = await strategyExecutionAdapter.executePrimitive('compile_memory', args);
      const ok = res && res.success !== false;
      return {
        configured: true,
        success: ok,
        status: ok ? 'completed' : 'tool_error',
        transport: 'strategy_primitive',
        output: res
      };
    }
    if (toolName === 'genos_resilience_hypermutation') {
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
      const res = await strategyExecutionAdapter.executePrimitive('mutate', {
        ...args,
        agentId: args.agentId || args.agent_id,
        orchestratorId: args.orchestratorId || args.orchestrator_id,
        mutations,
        hypermutation: true,
        mutationRate: args.mutationRate ?? 0.35
      });
      const ok = res && res.success !== false;
      return {
        configured: true,
        success: ok,
        status: ok ? 'completed' : 'tool_error',
        transport: 'strategy_primitive',
        output: res
      };
    }
    if (toolName.startsWith('genos_strat_')) {
      const primitive = toolName.slice('genos_strat_'.length);
      const res = await strategyExecutionAdapter.executePrimitive(primitive, args);
      const ok = res && res.success !== false;
      return {
        configured: true,
        success: ok,
        status: ok ? 'completed' : 'tool_error',
        transport: 'strategy_primitive',
        output: res
      };
    }

    if (toolName === 'genos_synaptic_stdp_update') {
      const primitiveArgs = {
        sourceId: args.source_id || args.sourceId || args.causeId,
        targetId: args.target_id || args.targetId || args.effectId,
        preSpikeAt: args.pre_spike_at || args.preSpikeAt,
        postSpikeAt: args.post_spike_at || args.postSpikeAt,
        learningRate: args.learning_rate || args.learningRate,
        transmitterType: args.transmitter_type || args.transmitterType,
        agentId: args.agent_id || args.agentId,
      };
      const res = await strategyExecutionAdapter.executePrimitive('stdp_update', primitiveArgs);
      const ok = res && res.success !== false;
      return {
        configured: true,
        success: ok,
        status: ok ? 'completed' : 'tool_error',
        transport: 'strategy_primitive',
        output: res
      };
    }

    if (toolName === 'genos_synaptic_prune_scale') {
      const { getDatabase } = require('../db');
      const db = await getDatabase();
      const threshold = Number(args.threshold ?? 0.1) * Number(args.scale ?? 1.0);
      const agentId = args.agent_id || args.agentId;
      const orgId = args.organization_id || args.organizationId;
      const projId = args.project_id || args.projectId;
      let prunedCount = 0;
      if (db) {
        let sql = 'DELETE FROM memory_synapses WHERE (ABS(weight) < ? OR (c3_opsonization > 0.5 AND cd47_expression < 0.5))';
        const params = [threshold];
        if (agentId && agentId !== 'global' && agentId !== 'default-agent') {
          sql += ' AND (source_id IN (SELECT id FROM genome_decisions WHERE created_by = ?) OR target_id IN (SELECT id FROM genome_decisions WHERE created_by = ?))';
          params.push(agentId, agentId);
        }
        if (orgId) {
          sql += ' AND (organization_id = ? OR organization_id IS NULL)';
          params.push(orgId);
        }
        if (projId) {
          sql += ' AND (project_id = ? OR project_id IS NULL)';
          params.push(projId);
        }
        const res = await db.run(sql, ...params);
        prunedCount = res?.changes || 0;
      }
      return {
        configured: true,
        success: true,
        status: 'completed',
        transport: 'strategy_primitive',
        output: { success: true, prunedSynapses: prunedCount, threshold, agent_id: agentId || 'global' }
      };
    }

    if (toolName === 'genos_execute_primitive') {
      if (Array.isArray(args.primitives) || Array.isArray(args.pipeline)) {
        const primitives = args.primitives || args.pipeline || [];
        const context = args.context || args;
        const res = await strategyExecutionAdapter.executePipelineWithFeedback(primitives, context);
        const ok = res && res.success !== false;
        return {
          configured: true,
          success: ok,
          status: ok ? 'completed' : 'tool_error',
          transport: 'strategy_primitive',
          output: res
        };
      }
      const primitive = args.primitive || args.primitive_name || args.name || '';
      const context = args.context || args;
      const res = await strategyExecutionAdapter.executePrimitive(primitive, context);
      const ok = res && res.success !== false;
      return {
        configured: true,
        success: ok,
        status: ok ? 'completed' : 'tool_error',
        transport: 'strategy_primitive',
        output: res
      };
    }

    if (toolName === 'genos_execute_strategy_pipeline') {
      const primitives = args.primitives || args.pipeline || [];
      const context = args.context || args;
      const res = await strategyExecutionAdapter.executePipelineWithFeedback(primitives, context);
      const ok = res && res.success !== false;
      return {
        configured: true,
        success: ok,
        status: ok ? 'completed' : 'tool_error',
        transport: 'strategy_primitive',
        output: res
      };
    }
  } catch (err) {
    return {
      configured: true,
      success: false,
      status: 'tool_error',
      transport: 'strategy_primitive',
      output: { success: false, error: err.message }
    };
  }

  return null;
}

module.exports = {
  isStrategyTool,
  executeStrategyTool
};
