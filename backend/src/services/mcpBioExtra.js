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

  if (toolName === 'genos_quantitative_genetics') {
    const observations = Array.isArray(args.observations) ? args.observations : [];
    if (observations.length < 2) return { configured: true, success: false, status: 'invalid_args', transport: 'local', error: 'observations requires at least two numeric phenotype/genotype pairs.' };
    const pairs = observations.map((item) => ({ genotype: Number(item.genotype), phenotype: Number(item.phenotype) }));
    if (pairs.some((pair) => !Number.isFinite(pair.genotype) || !Number.isFinite(pair.phenotype))) return { configured: true, success: false, status: 'invalid_args', transport: 'local', error: 'genotype and phenotype must be finite numbers.' };
    const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = (values) => { const center = mean(values); return mean(values.map((value) => (value - center) ** 2)); };
    const covariance = (left, right) => { const leftMean = mean(left); const rightMean = mean(right); return mean(left.map((value, index) => (value - leftMean) * (right[index] - rightMean))); };
    const genotype = pairs.map((pair) => pair.genotype);
    const phenotype = pairs.map((pair) => pair.phenotype);
    const denominator = Math.sqrt(variance(genotype) * variance(phenotype));
    const correlation = denominator === 0 ? 0 : covariance(genotype, phenotype) / denominator;
    const result = { heritabilityProxy: Math.max(0, Math.min(1, correlation ** 2)), correlation, sampleSize: pairs.length };
    return { configured: true, success: true, status: 'completed', transport: 'local', output: JSON.stringify(result), evidence: { method: 'pearson_correlation_squared', inputs: pairs.length }, ...result };
  }

  if (toolName === 'genos_coevolution') {
    const populationA = Array.isArray(args.population_a) ? args.population_a : [];
    const populationB = Array.isArray(args.population_b) ? args.population_b : [];
    if (!populationA.length || !populationB.length) return { configured: true, success: false, status: 'invalid_args', transport: 'local', error: 'population_a and population_b are required.' };
    const average = (population) => population.reduce((sum, item) => sum + Number(typeof item === 'object' ? item.fitness : item), 0) / population.length;
    const fitnessA = average(populationA); const fitnessB = average(populationB);
    const result = { fitnessA, fitnessB, delta: fitnessA - fitnessB, dominantPopulation: fitnessA === fitnessB ? 'tie' : fitnessA > fitnessB ? 'population_a' : 'population_b' };
    return { configured: true, success: true, status: 'completed', transport: 'local', output: JSON.stringify(result), evidence: { method: 'mean_fitness_comparison', populationSizes: [populationA.length, populationB.length] }, ...result };
  }

  if (toolName === 'genos_molecular_chaperone') {
    const proteins = Array.isArray(args.proteins) ? args.proteins : [];
    const repaired = proteins.map((protein) => ({ ...protein, folded: protein.folded === true || protein.structure != null }));
    const result = { total: repaired.length, folded: repaired.filter((protein) => protein.folded).length, repaired };
    return { configured: true, success: true, status: 'completed', transport: 'local', output: JSON.stringify(result), evidence: { method: 'structure_validation_and_fold_marking' }, ...result };
  }

  if (toolName === 'genos_necrosis_ledger') {
    const events = Array.isArray(args.events) ? args.events : (args.event ? [args.event] : []);
    const ledger = events.map((event, index) => ({ id: event.id || `necrosis-${index + 1}`, cause: event.cause || 'unspecified', severity: Math.max(0, Math.min(1, Number(event.severity ?? 0))), recordedAt: event.recordedAt || new Date().toISOString() }));
    return { configured: true, success: true, status: 'completed', transport: 'local', output: JSON.stringify({ count: ledger.length, ledger }), evidence: { method: 'append_only_event_normalization' }, count: ledger.length, ledger };
  }

  if (toolName === 'genos_multisensory_integration') {
    const signals = Array.isArray(args.signals) ? args.signals : [];
    if (!signals.length) return { configured: true, success: false, status: 'invalid_args', transport: 'local', error: 'signals are required.' };
    const totalWeight = signals.reduce((sum, signal) => sum + Math.max(0, Number(signal.weight ?? 1)), 0);
    if (totalWeight === 0) return { configured: true, success: false, status: 'invalid_args', transport: 'local', error: 'at least one signal must have positive weight.' };
    const integrated = signals.reduce((sum, signal) => sum + Number(signal.value || 0) * Math.max(0, Number(signal.weight ?? 1)), 0) / totalWeight;
    return { configured: true, success: true, status: 'completed', transport: 'local', output: JSON.stringify({ integrated, signalCount: signals.length }), evidence: { method: 'weighted_signal_fusion' }, integrated, signalCount: signals.length };
  }

  if (toolName === 'genos_thalamic_filtering') {
    const signals = Array.isArray(args.signals) ? args.signals : [];
    const threshold = Number(args.threshold ?? 0.5);
    const admitted = signals.filter((signal) => Number(signal.salience ?? signal.score ?? 0) >= threshold);
    const result = { threshold, admitted, suppressed: signals.length - admitted.length };
    return { configured: true, success: true, status: 'completed', transport: 'local', output: JSON.stringify(result), evidence: { method: 'salience_threshold_gate' }, ...result };
  }

  if (toolName === 'genos_social_trust') {
    const positive = Math.max(0, Number(args.positive ?? 0)); const negative = Math.max(0, Number(args.negative ?? 0));
    const trust = (positive + 1) / (positive + negative + 2);
    return { configured: true, success: true, status: 'completed', transport: 'local', output: JSON.stringify({ trust }), evidence: { method: 'laplace_smoothed_beta_estimate' }, trust, positive, negative };
  }

  if (toolName === 'genos_routing_algorithm') {
    const graph = args.graph && typeof args.graph === 'object' ? args.graph : {};
    const start = String(args.start); const target = String(args.target);
    const queue = [[start, [start]]]; const visited = new Set([start]); let route = null;
    while (queue.length) { const [node, current] = queue.shift(); if (node === target) { route = current; break; } for (const next of (Array.isArray(graph[node]) ? graph[node] : [])) { if (!visited.has(String(next))) { visited.add(String(next)); queue.push([String(next), [...current, String(next)]]); } } }
    return { configured: true, success: route !== null, status: route ? 'completed' : 'not_found', transport: 'local', output: JSON.stringify({ route }), evidence: { method: 'breadth_first_shortest_hop_search' }, route };
  }

  return null;
}

module.exports = { executeBioExtra };
