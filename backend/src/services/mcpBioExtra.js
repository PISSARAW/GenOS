const { handleBioExtraTool, BIO_EXTRA_HANDLERS } = require('./mcpBioExtra/handlers/extraHandlers');
const { runGenosSync } = require('./genosCli');
const { quoteCliArg } = require('./mcpBioTools/shellQuote');

// Refuse les flags injectés: seuls les tokens simples sont acceptés.
function safeToken(value, fallback) {
  const text = String(value === undefined || value === null ? fallback : value);
  if (!/^[a-z0-9-_]+$/i.test(text)) {
    throw Object.assign(new Error(`Refused unsafe CLI flag value: ${text}`), { code: 'INVALID_TOOL_ARGUMENTS' });
  }
  return text;
}

function q(value) {
  return quoteCliArg(value === undefined || value === null ? '' : value);
}

function num(value, fallback) {
  const parsed = Number(value === undefined || value === null ? fallback : value);
  if (!Number.isFinite(parsed)) {
    throw Object.assign(new Error('Refused non-numeric CLI value.'), { code: 'INVALID_TOOL_ARGUMENTS' });
  }
  return parsed;
}

function handleBioCall(cmd, timeoutMs) {
  try {
    const out = runGenosSync(cmd, { timeoutMs });
    const outputStr = out.toString();
    let parsed = null;
    try { parsed = JSON.parse(outputStr.trim()); } catch (_) {}
    return { configured: true, success: true, status: 'completed', transport: 'local', output: outputStr, json: parsed, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
  } catch (e) {
    return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
  }
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

function definedOr(value, fallback) {
  return value !== undefined ? value : fallback;
}

function appendOptionalParam(params, args, spec) {
  const [flag, ...keys] = spec;
  for (const key of keys) {
    const value = args[key];
    if (value !== undefined && value !== null) {
      params.push(`${flag} ${quoteCliArg(value)}`);
      return;
    }
  }
}

function appendQuotedParam(params, flag, value) {
  if (value) params.push(`${flag} ${quoteCliArg(value)}`);
}

function formatEcho(echo) {
  if (typeof echo !== 'object') return echo;
  return `${firstTruthy(echo.target_locus, echo.locus)}:${firstTruthy(echo.time_of_flight_ms, echo.tof, 10.0)}:${firstTruthy(echo.doppler_shift_hz, echo.doppler, 0.0)}:${firstTruthy(echo.attenuation_db, echo.attenuation, 20.0)}`;
}

function formatEchoes(samples) {
  if (Array.isArray(samples)) return samples.map(formatEcho).join(',');
  return firstTruthy(samples, 'branch/auth:10.0:500.0:20.0,db/deadlock:40.0:-100.0:45.0');
}

const TOOL_HANDLERS = {
  'genos_biomimicry_spore': (args, timeoutMs) => {
    const params = [`--action ${safeToken(firstTruthy(args.action, 'create'), 'create')}`, `--agent-id ${q(firstTruthy(args.agent_id, 'griot-01'))}`, `--spore-type ${safeToken(firstTruthy(args.spore_type, 'bacterial'), 'bacterial')}`];
    appendOptionalParam(params, args, ['--warm-and-wet', 'warm_and_wet']);
    appendOptionalParam(params, args, ['--nutrients', 'nutrients']);
    return handleBioCall(`genos biomimicry spore ${params.join(' ')}`, timeoutMs);
  },
  'genos_biomimicry_bioluminescence': (args, timeoutMs) => {
    return handleBioCall(`genos biomimicry bioluminescence --agent-id ${q(firstTruthy(args.agent_id, 'griot-01'))} --color ${safeToken(firstTruthy(args.color, 'green'), 'green')} --organelle ${q(firstTruthy(args.organelle, 'mitochondria'))} --event-type ${q(firstTruthy(args.event_type, 'TELEMETRY'))} --details ${q(firstTruthy(args.details, ''))}`, timeoutMs);
  },
  'genos_biomimicry_anti_collusion': (args, timeoutMs) => {
    const agentId = firstTruthy(args.agent_id, 'griot-01');
    const tokens = num(firstTruthy(args.consumed_tokens, 600), 600);
    const physical = args.physical_test_passed ? '--physical-test-passed' : '';
    return handleBioCall(`genos biomimicry anti-collusion --agent-id ${q(agentId)} --consumed-tokens ${tokens} ${physical}`.trim(), timeoutMs);
  },
  'genos_biomimicry_redundancy': (args, timeoutMs) => {
    const expected = firstTruthy(args.expected_tool, 'default_tool');
    const mutated = firstTruthy(args.mutated_tool, args.expected_tool, 'default_tool');
    const fallback = args.fallback ? '--fallback' : '';
    return handleBioCall(`genos biomimicry redundancy --expected-tool ${q(expected)} --mutated-tool ${q(mutated)} ${fallback}`.trim(), timeoutMs);
  },
  'genos_biomimicry_tissue': (args, timeoutMs) => {
    const params = [`--action ${safeToken(firstTruthy(args.action, 'create'), 'create')}`, `--name ${q(firstTruthy(args.name, 'Tissue_Collective'))}`];
    appendQuotedParam(params, '--role', args.role);
    appendQuotedParam(params, '--stem-id', args.stem_id);
    appendQuotedParam(params, '--worker-id', args.worker_id);
    appendQuotedParam(params, '--task', args.task);
    return handleBioCall(`genos biomimicry tissue ${params.join(' ')}`, timeoutMs);
  },
  'genos_biomimicry_embryology': (args, timeoutMs) => {
    return handleBioCall(`genos biomimicry embryology --divisions ${num(firstTruthy(args.divisions, 2), 2)} --gradient ${num(firstTruthy(args.gradient, 1.0), 1.0)}`, timeoutMs);
  },
  'genos_biomimicry_therapy': (args, timeoutMs) => {
    return handleBioCall(`genos biomimicry therapy --agent-id ${q(firstTruthy(args.agent_id, 'griot-01'))} --therapy-type ${q(firstTruthy(args.therapy_type, 'targeted'))}`, timeoutMs);
  },
  'genos_biomimicry_vomeronasal': (args, timeoutMs) => {
    const agentId = firstTruthy(args.agent_id, args.agentId, 'agent_0');
    const locus = firstTruthy(args.locus, 'global');
    const ptype = firstTruthy(args.pheromone_type, args.pheromoneType, 'alarm');
    const concentration = definedOr(args.concentration, 0.8);
    const sensitivity = definedOr(args.sensitivity, 0.15);
    return handleBioCall(`genos biomimicry vomeronasal --agent-id ${q(agentId)} --locus ${q(locus)} --pheromone-type ${safeToken(ptype, 'alarm')} --concentration ${num(concentration, 0.8)} --sensitivity ${num(sensitivity, 0.15)}`, timeoutMs);
  },
  'genos_biomimicry_electrosensory': (args, timeoutMs) => {
    const agentId = firstTruthy(args.agent_id, args.agentId, 'mormyro_0');
    const action = firstTruthy(args.action, 'discharge_and_analyze');
    const freq = firstTruthy(args.frequency_hz, args.frequencyHz, 800.0);
    const sensitivity = definedOr(args.sensitivity, 0.05);
    const threshold = definedOr(args.distortion_threshold, 0.12);
    const samples = Array.isArray(args.samples) ? args.samples.join(',') : firstTruthy(args.samples, '100.0,102.0,98.0,105.0,99.0');
    return handleBioCall(`genos biomimicry electrosensory --agent-id ${q(agentId)} --action ${q(action)} --frequency-hz ${num(freq, 800.0)} --sensitivity ${num(sensitivity, 0.05)} --distortion-threshold ${num(threshold, 0.12)} --samples ${q(samples)}`, timeoutMs);
  },
  'genos_biomimicry_cluster_n': (args, timeoutMs) => {
    const agentId = firstTruthy(args.agent_id, args.agentId, 'migratory_0');
    const action = firstTruthy(args.action, 'align');
    const sensitivity = definedOr(args.sensitivity, 0.02);
    const tolerance = firstTruthy(args.tolerance_deg, args.toleranceDeg, 15.0);
    const goal = Array.isArray(args.goal_vector) ? args.goal_vector.join(',') : firstTruthy(args.goal_vector, '1.0,0.0,0.0');
    const current = Array.isArray(args.current_vector) ? args.current_vector.join(',') : firstTruthy(args.current_vector, '0.96,0.15,0.0');
    return handleBioCall(`genos biomimicry cluster-n --agent-id ${q(agentId)} --action ${q(action)} --sensitivity ${num(sensitivity, 0.02)} --tolerance-deg ${num(tolerance, 15.0)} --goal-vector ${q(goal)} --current-vector ${q(current)}`, timeoutMs);
  },
  'genos_biomimicry_tectum_thermal': (args, timeoutMs) => {
    const agentId = firstTruthy(args.agent_id, args.agentId, 'viper_0');
    const action = firstTruthy(args.action, 'fuse_modalities');
    const sensitivityMk = definedOr(args.sensitivity_mk, 3.0);
    const fusionWeight = definedOr(args.fusion_weight, 0.65);
    const threshold = definedOr(args.threshold, 0.70);
    const visual = firstTruthy(args.visual_nodes, 'src/auth.rs:0.8,src/db.rs:0.4,src/api.rs:0.3');
    const thermal = firstTruthy(args.thermal_readings, 'src/auth.rs:0.95,src/db.rs:0.2,src/api.rs:0.1');
    return handleBioCall(`genos biomimicry tectum-thermal --agent-id ${q(agentId)} --action ${q(action)} --sensitivity-mk ${num(sensitivityMk, 3.0)} --fusion-weight ${num(fusionWeight, 0.65)} --threshold ${num(threshold, 0.70)} --visual-nodes ${q(visual)} --thermal-readings ${q(thermal)}`, timeoutMs);
  },
  'genos_biomimicry_echolocation': (args, timeoutMs) => {
    const agentId = firstTruthy(args.agent_id, args.agentId, 'bat_0');
    const action = firstTruthy(args.action, 'probe_echoes');
    const baseFreq = definedOr(args.base_frequency_khz, firstTruthy(args.baseFrequencyKhz, 60.0));
    const thresholdM = definedOr(args.obstacle_threshold_m, firstTruthy(args.obstacleThresholdM, 2.5));
    const echoes = formatEchoes(args.echoes);
    return handleBioCall(`genos biomimicry echolocation --agent-id ${q(agentId)} --action ${q(action)} --base-frequency-khz ${num(baseFreq, 60.0)} --obstacle-threshold-m ${num(thresholdM, 2.5)} --echoes ${q(echoes)}`, timeoutMs);
  },
  'genos_cell_division': (args, timeoutMs) => {
    const agentId = firstTruthy(args.agent_id, args.agentId, 'cell_division_root');
    const params = [`--agent-id ${q(agentId)}`, `--mode ${safeToken(firstTruthy(args.mode, 'mitosis'), 'mitosis')}`];
    appendOptionalParam(params, args, ['--daughter-volume', 'daughter_volume', 'daughterVolume']);
    appendOptionalParam(params, args, ['--mutation-rate', 'mutation_rate', 'mutationRate']);
    appendOptionalParam(params, args, ['--hayflick-limit', 'hayflick_limit', 'hayflickLimit']);
    appendOptionalParam(params, args, ['--merozoite-count', 'merozoite_count', 'merozoiteCount']);
    appendOptionalParam(params, args, ['--seed', 'seed']);
    return handleBioCall(`genos evolution division ${params.join(' ')}`, timeoutMs);
  },
  'genos_dna_methylation': (args, timeoutMs) => {
    const agentId = firstTruthy(args.agent_id, 'global');
    const locus = firstTruthy(args.locus, args.gene, 'promoter_locus');
    const state = firstTruthy(args.state, args.methylated === false ? 'Euchromatin' : 'HeterochromatinFacultative');
    const pioneer = firstTruthy(args.pioneer_factor, args.pioneerFactor) ? ' --pioneer-factor' : '';
    return handleBioCall(`genos biomimicry epigenetic-chromatin --agent-id ${q(agentId)} --locus ${q(locus)} --state ${safeToken(state, 'HeterochromatinFacultative')}${pioneer}`, timeoutMs);
  },
  'genos_grns': (args, timeoutMs) => {
    return handleBioCall(`genos biomimicry gene-regulatory-network --agent-id ${q(firstTruthy(args.agent_id, 'global'))} --condition ${q(firstTruthy(args.condition, 'environmental_trigger'))} --action-script ${q(firstTruthy(args.action, args.action_script, 'upregulate'))}`, timeoutMs);
  },
  'genos_lamarckian_mutation': (args, timeoutMs) => {
    const agentId = firstTruthy(args.agent_id, 'global');
    const res = handleBioCall(`genos biomimicry hypermutation --agent-id ${q(agentId)}`, timeoutMs);
    if (res && res.success) return res;
    return { configured: true, success: false, status: 'tool_error', transport: 'local', output: firstTruthy(res && res.output, `Lamarckian mutation failed for agent '${agentId}'.`), error: `Lamarckian mutation was not applied for agent '${agentId}'.` };
  },
};

function getToolHandler(toolName) {
  return TOOL_HANDLERS[toolName];
}

function quantitativeGenetics(args) {
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

function coevolution(args) {
  const populationA = Array.isArray(args.population_a) ? args.population_a : [];
  const populationB = Array.isArray(args.population_b) ? args.population_b : [];
  if (!populationA.length || !populationB.length) return { configured: true, success: false, status: 'invalid_args', transport: 'local', error: 'population_a and population_b are required.' };
  const average = (population) => population.reduce((sum, item) => sum + Number(typeof item === 'object' ? item.fitness : item), 0) / population.length;
  const fitnessA = average(populationA); const fitnessB = average(populationB);
  const dominantPopulation = fitnessA === fitnessB ? 'tie' : fitnessA > fitnessB ? 'population_a' : 'population_b';
  const result = { fitnessA, fitnessB, delta: fitnessA - fitnessB, dominantPopulation };
  return { configured: true, success: true, status: 'completed', transport: 'local', output: JSON.stringify(result), evidence: { method: 'mean_fitness_comparison', populationSizes: [populationA.length, populationB.length] }, ...result };
}

function molecularChaperone(args) {
  const proteins = Array.isArray(args.proteins) ? args.proteins : [];
  const repaired = proteins.map((protein) => ({ ...protein, folded: protein.folded === true || protein.structure != null }));
  const result = { total: repaired.length, folded: repaired.filter((protein) => protein.folded).length, repaired };
  return { configured: true, success: true, status: 'completed', transport: 'local', output: JSON.stringify(result), evidence: { method: 'structure_validation_and_fold_marking' }, ...result };
}

function necrosisLedger(args) {
  const events = Array.isArray(args.events) ? args.events : (args.event ? [args.event] : []);
  const ledger = events.map((event, index) => ({ id: firstTruthy(event.id, `necrosis-${index + 1}`), cause: firstTruthy(event.cause, 'unspecified'), severity: Math.max(0, Math.min(1, Number(nullish(event.severity, 0)))), recordedAt: firstTruthy(event.recordedAt, new Date().toISOString()) }));
  return { configured: true, success: true, status: 'completed', transport: 'local', output: JSON.stringify({ count: ledger.length, ledger }), evidence: { method: 'append_only_event_normalization' }, count: ledger.length, ledger };
}

function multisensoryIntegration(args) {
  const signals = Array.isArray(args.signals) ? args.signals : [];
  if (!signals.length) return { configured: true, success: false, status: 'invalid_args', transport: 'local', error: 'signals are required.' };
  const weightOf = (signal) => Math.max(0, Number(nullish(signal.weight, 1)));
  const totalWeight = signals.reduce((sum, signal) => sum + weightOf(signal), 0);
  if (totalWeight === 0) return { configured: true, success: false, status: 'invalid_args', transport: 'local', error: 'at least one signal must have positive weight.' };
  const integrated = signals.reduce((sum, signal) => sum + Number(signal.value || 0) * weightOf(signal), 0) / totalWeight;
  return { configured: true, success: true, status: 'completed', transport: 'local', output: JSON.stringify({ integrated, signalCount: signals.length }), evidence: { method: 'weighted_signal_fusion' }, integrated, signalCount: signals.length };
}

function thalamicFiltering(args) {
  const signals = Array.isArray(args.signals) ? args.signals : [];
  const threshold = Number(nullish(args.threshold, 0.5));
  const salienceOf = (signal) => Number(firstTruthy(signal.salience, signal.score, 0));
  const admitted = signals.filter((signal) => salienceOf(signal) >= threshold);
  const result = { threshold, admitted, suppressed: signals.length - admitted.length };
  return { configured: true, success: true, status: 'completed', transport: 'local', output: JSON.stringify(result), evidence: { method: 'salience_threshold_gate' }, ...result };
}

function socialTrust(args) {
  const positive = Math.max(0, Number(nullish(args.positive, 0))); const negative = Math.max(0, Number(nullish(args.negative, 0)));
  const trust = (positive + 1) / (positive + negative + 2);
  return { configured: true, success: true, status: 'completed', transport: 'local', output: JSON.stringify({ trust }), evidence: { method: 'laplace_smoothed_beta_estimate' }, trust, positive, negative };
}

function routingAlgorithm(args) {
  const graph = args.graph && typeof args.graph === 'object' ? args.graph : {};
  const start = String(args.start); const target = String(args.target);
  const queue = [[start, [start]]]; const visited = new Set([start]); let route = null;
  while (queue.length) { const [node, current] = queue.shift(); if (node === target) { route = current; break; } for (const next of (Array.isArray(graph[node]) ? graph[node] : [])) { if (!visited.has(String(next))) { visited.add(String(next)); queue.push([String(next), [...current, String(next)]]); } } }
  return { configured: true, success: route !== null, status: route ? 'completed' : 'not_found', transport: 'local', output: JSON.stringify({ route }), evidence: { method: 'breadth_first_shortest_hop_search' }, route };
}

const IN_MEMORY_HANDLERS = {
  genos_quantitative_genetics: quantitativeGenetics,
  genos_coevolution: coevolution,
  genos_molecular_chaperone: molecularChaperone,
  genos_necrosis_ledger: necrosisLedger,
  genos_multisensory_integration: multisensoryIntegration,
  genos_thalamic_filtering: thalamicFiltering,
  genos_social_trust: socialTrust,
  genos_routing_algorithm: routingAlgorithm
};

function executeBioExtra(toolName, args = {}, options = {}) {
  const timeoutMs = Math.max(1, Number(options.timeoutMs) || 30000);
  if (!toolName.startsWith('genos_')) return null;
  if (BIO_EXTRA_HANDLERS && BIO_EXTRA_HANDLERS[toolName]) {
    return handleBioExtraTool(toolName, args, timeoutMs);
  }
  const handler = getToolHandler(toolName) || IN_MEMORY_HANDLERS[toolName];
  if (handler) return handler(args, timeoutMs);
  return null;
}

function isBioExtraTool(toolName) {
  const name = String(toolName || '').trim();
  if (!name) return false;
  if (getToolHandler(name) || IN_MEMORY_HANDLERS[name]) return true;
  try {
    const { BIO_EXTRA_HANDLERS } = require('./mcpBioExtra/handlers/extraHandlers');
    if (BIO_EXTRA_HANDLERS && BIO_EXTRA_HANDLERS[name]) return true;
  } catch (_) {}
  return false;
}

module.exports = { executeBioExtra, isBioExtraTool };
