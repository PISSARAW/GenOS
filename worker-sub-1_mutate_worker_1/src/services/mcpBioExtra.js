const { runGenosSync } = require('./genosCli');

function handleBioCall(cmd, timeoutMs) {
  try {
    const out = runGenosSync(cmd, { timeoutMs });
    const outputStr = out.toString();
    let parsed = null;
    try {
      parsed = JSON.parse(outputStr.trim());
    } catch (_) {}
    return {
      configured: true,
      success: true,
      status: 'completed',
      transport: 'local',
      output: outputStr,
      json: parsed,
      ...(parsed && typeof parsed === 'object' ? parsed : {})
    };
  } catch (e) {
    return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
  }
}

function executeBioExtra(toolName, args = {}, options = {}) {
  const timeoutMs = Math.max(1, Number(options.timeoutMs) || 30000);
  if (!toolName.startsWith('genos_')) return null;

  if (toolName === 'genos_get_conscience_state' || toolName === 'genos_biomimicry_conscience_state') {
    const agentId = args.agent_id || args.agentId || 'griot-01';
    const agentConscience = require('./agentConscienceService');
    const { getDatabase } = require('../db');
    return (async () => {
      try {
        const db = await getDatabase();
        const state = await agentConscience.loadConscienceState(db, agentId);
        return {
          configured: true,
          success: true,
          status: 'completed',
          transport: 'local',
          output: JSON.stringify({ agentId, conscience: state }),
          agentId,
          conscience: state
        };
      } catch (e) {
        return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.message };
      }
    })();
  }

  if (toolName === 'genos_get_conscience_history' || toolName === 'genos_biomimicry_conscience_history') {
    const agentId = args.agent_id || args.agentId || 'griot-01';
    const limit = Number(args.limit) || 20;
    const offset = Number(args.offset) || 0;
    const agentConscience = require('./agentConscienceService');
    const { getDatabase } = require('../db');
    return (async () => {
      try {
        const db = await getDatabase();
        const transitions = await agentConscience.getConscienceTransitions(db, agentId, { limit, offset });
        return {
          configured: true,
          success: true,
          status: 'completed',
          transport: 'local',
          output: JSON.stringify({ agentId, count: transitions.length, transitions }),
          agentId,
          count: transitions.length,
          transitions
        };
      } catch (e) {
        return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.message };
      }
    })();
  }

  if (toolName === 'genos_get_swarm_entropy' || toolName === 'genos_biomimicry_entropy') {
    const agentId = args.agent_id || args.agentId;
    const swarmMetrics = require('./swarmMetricsService');
    const swarmSentinel = require('./swarmSentinelService');
    const { getDatabase } = require('../db');
    return (async () => {
      try {
        const db = await getDatabase();
        const events = await db.all('SELECT action as type, event_type as action, agent_id, payload_json, created_at FROM telemetry_events ORDER BY created_at DESC LIMIT 50');
        const chronologicalEvents = [...events].reverse();
        const swarmEntropy = swarmMetrics.calculateShannonEntropy(chronologicalEvents);
        const agentEntropy = agentId ? swarmSentinel.getAgentEntropy(agentId) : null;
        return {
          configured: true,
          success: true,
          status: 'completed',
          transport: 'local',
          output: JSON.stringify({ swarmEntropy, agentEntropy }),
          swarmEntropy,
          agentEntropy
        };
      } catch (e) {
        return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.message };
      }
    })();
  }

  if (toolName === 'genos_biomimicry_spore') {
    const action = args.action || 'create';
    const agentId = args.agent_id || 'griot-01';
    const sporeType = args.spore_type || 'bacterial';
    const params = [`--action ${action}`, `--agent-id ${agentId}`, `--spore-type ${sporeType}`];
    if (args.warm_and_wet !== undefined) params.push(`--warm-and-wet ${args.warm_and_wet}`);
    if (args.nutrients !== undefined) params.push(`--nutrients ${args.nutrients}`);
    return handleBioCall(`genos biomimicry spore ${params.join(' ')}`, timeoutMs);
  }

  if (toolName === 'genos_biomimicry_bioluminescence') {
    const agentId = args.agent_id || 'griot-01';
    const color = args.color || 'green';
    const organelle = args.organelle || 'mitochondria';
    const eventType = args.event_type || 'TELEMETRY';
    const details = args.details || '';
    return handleBioCall(`genos biomimicry bioluminescence --agent-id ${agentId} --color ${color} --organelle "${organelle}" --event-type "${eventType}" --details "${details}"`, timeoutMs);
  }

  if (toolName === 'genos_biomimicry_anti_collusion') {
    const agentId = args.agent_id || 'griot-01';
    const tokens = args.consumed_tokens || 600;
    const flag = args.physical_test_passed ? '--physical-test-passed' : '';
    return handleBioCall(`genos biomimicry anti-collusion --agent-id ${agentId} --consumed-tokens ${tokens} ${flag}`.trim(), timeoutMs);
  }

  if (toolName === 'genos_biomimicry_redundancy') {
    const exp = args.expected_tool || 'default_tool';
    const mut = args.mutated_tool || exp;
    const flag = args.fallback ? '--fallback' : '';
    return handleBioCall(`genos biomimicry redundancy --expected-tool "${exp}" --mutated-tool "${mut}" ${flag}`.trim(), timeoutMs);
  }

  if (toolName === 'genos_biomimicry_tissue') {
    const action = args.action || 'create';
    const name = args.name || 'Tissue_Collective';
    const params = [`--action ${action}`, `--name "${name}"`];
    if (args.role) params.push(`--role "${args.role}"`);
    if (args.stem_id) params.push(`--stem-id "${args.stem_id}"`);
    if (args.worker_id) params.push(`--worker-id "${args.worker_id}"`);
    if (args.task) params.push(`--task "${args.task}"`);
    return handleBioCall(`genos biomimicry tissue ${params.join(' ')}`, timeoutMs);
  }

  if (toolName === 'genos_biomimicry_embryology') {
    const divisions = args.divisions || 2;
    const gradient = args.gradient || 1.0;
    return handleBioCall(`genos biomimicry embryology --divisions ${divisions} --gradient ${gradient}`, timeoutMs);
  }

  if (toolName === 'genos_biomimicry_therapy') {
    const agentId = args.agent_id || 'griot-01';
    const therapy = args.therapy_type || 'targeted';
    return handleBioCall(`genos biomimicry therapy --agent-id ${agentId} --therapy-type "${therapy}"`, timeoutMs);
  }

  if (toolName === 'genos_cell_division') {
    const agentId = args.agent_id || args.agentId || 'cell_division_root';
    const mode = args.mode || 'mitosis';
    const params = [`--agent-id ${agentId}`, `--mode ${mode}`];
    if (args.daughter_volume !== undefined || args.daughterVolume !== undefined) {
      params.push(`--daughter-volume ${args.daughter_volume ?? args.daughterVolume}`);
    }
    if (args.mutation_rate !== undefined || args.mutationRate !== undefined) {
      params.push(`--mutation-rate ${args.mutation_rate ?? args.mutationRate}`);
    }
    if (args.hayflick_limit !== undefined || args.hayflickLimit !== undefined) {
      params.push(`--hayflick-limit ${args.hayflick_limit ?? args.hayflickLimit}`);
    }
    if (args.merozoite_count !== undefined || args.merozoiteCount !== undefined) {
      params.push(`--merozoite-count ${args.merozoite_count ?? args.merozoiteCount}`);
    }
    if (args.seed !== undefined) {
      params.push(`--seed ${args.seed}`);
    }
    return handleBioCall(`genos evolution division ${params.join(' ')}`, timeoutMs);
  }

  if (toolName === 'genos_dna_methylation') {
    const agentId = args.agent_id || 'global';
    const locus = args.locus || args.gene || 'promoter_locus';
    const state = args.state || (args.methylated === false ? 'Euchromatin' : 'HeterochromatinFacultative');
    const pioneer = (args.pioneer_factor || args.pioneerFactor) ? ' --pioneer-factor' : '';
    return handleBioCall(`genos biomimicry epigenetic-chromatin --agent-id ${agentId} --locus "${locus}" --state ${state}${pioneer}`, timeoutMs);
  }

  if (toolName === 'genos_grns') {
    const agentId = args.agent_id || 'global';
    const condition = args.condition || 'environmental_trigger';
    const action = args.action || args.action_script || 'upregulate';
    return handleBioCall(`genos biomimicry gene-regulatory-network --agent-id ${agentId} --condition "${condition}" --action-script "${action}"`, timeoutMs);
  }

  if (toolName === 'genos_lamarckian_mutation') {
    const agentId = args.agent_id || 'global';
    const res = handleBioCall(`genos biomimicry hypermutation --agent-id ${agentId}`, timeoutMs);
    if (res && res.success) return res;
    return {
      configured: true,
      success: false,
      status: 'tool_error',
      transport: 'local',
      output: res?.output || `Lamarckian mutation failed for agent '${agentId}'.`,
      error: `Lamarckian mutation was not applied for agent '${agentId}'.`
    };
  }

  const fallbackBioTools = ['genos_quantitative_genetics', 'genos_coevolution', 'genos_molecular_chaperone', 'genos_necrosis_ledger', 'genos_multisensory_integration', 'genos_thalamic_filtering', 'genos_social_trust', 'genos_routing_algorithm'];
  if (fallbackBioTools.includes(toolName)) {
    return {
      configured: false,
      success: false,
      status: 'unsupported',
      transport: 'local',
      output: `Biomimetic tool '${toolName}' has no concrete runtime implementation.`,
      error: `Biomimetic tool '${toolName}' is unavailable until an implementation provides evidence.`
    };
  }

  return null;
}

module.exports = { executeBioExtra };
