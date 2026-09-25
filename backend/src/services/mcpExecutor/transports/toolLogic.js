const { runGenosSync } = require('../../genosCli');

function runSafeSync(commandLine, timeoutMs) {
  return runGenosSync(commandLine, typeof timeoutMs === 'number' ? { timeoutMs } : timeoutMs);
}

function completed(output) {
  return { configured: true, success: true, status: 'completed', transport: 'local', output };
}

function failed(error) {
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: error.stdout ? error.stdout.toString() : error.message };
}

function runSyncResult(buildCommand, timeoutMs) {
  try {
    return completed(runSafeSync(buildCommand(), timeoutMs).toString());
  } catch (error) {
    return failed(error);
  }
}

function firstTruthy(...values) {
  for (const value of values) {
    if (value) return value;
  }
  return undefined;
}

function firstNonNull(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function nullish(value, fallback) {
  return value === undefined || value === null ? fallback : value;
}

function changesOf(res) {
  return res && res.changes ? res.changes : 0;
}

function revalidateToolCall(toolName, args) {
  const { directToolLeaseAllows } = require('../../mcpExecutor/config');
  const { validateToolArguments } = require('../../mcpArgumentValidation');
  if (!directToolLeaseAllows(toolName)) {
    return { configured: false, success: false, status: 'lease_denied', error: `Tool '${toolName}' is outside the active MCP lease.`, code: 'MCP_TOOL_LEASE_DENIED' };
  }
  const argumentError = validateToolArguments(toolName, args || {});
  if (argumentError) {
    return { configured: true, success: false, status: 'invalid_args', error: argumentError.message, code: argumentError.code };
  }
  const circuit = require('../../circuitBreaker').canExecute(toolName, 'operator', 'global', args);
  if (!circuit.allowed) {
    return { configured: true, success: false, status: 'circuit_open', error: circuit.message, code: circuit.reason || 'MCP_CIRCUIT_OPEN' };
  }
  return null;
}

const LOCAL_COMMAND_TOOLS = {
  genos_agent_world_capsule: (args) => `genos capsule create --snapshot ${args.snapshot_id}` + (args.seed ? ` --seed "${args.seed}"` : '') + (args.budget_steps ? ` --budget-steps ${args.budget_steps}` : ''),
  genos_world_sandbox_execute: (args) => `genos world run --provider directory --root .genos/world --world-id ${args.world_id} --command "${args.command}" --sandbox-backend ${args.backend}`,
  genos_world_hardlink_create: (args) => `genos world create --provider hardlink --root .genos/world --world-id ${args.world_id} --seed "${args.seed}"`,
  genos_biomimicry_sar_prime: (args) => `genos biomimicry bio-feature --feature sar --action prime --param incident_id=${args.incident_id} --param severity=${args.severity || 1.0}`,
  genos_advanced_budget_allocation: (args) => {
    const cmdParams = [`--param total_budget=${args.total_budget}`];
    if (args.entropy !== undefined) cmdParams.push(`--param entropy=${args.entropy}`);
    if (args.scenarios) args.scenarios.forEach((s) => cmdParams.push(`--param scenario="${s}"`));
    return `genos biomimicry bio-feature --feature bet-hedging --action allocate ${cmdParams.join(' ')}`;
  },
  genos_merge: (args) => `genos merge ${args.branch_id}` + (args.conditions ? ` --conditions "${args.conditions}"` : ''),
  genos_export_audit: (args) => `genos audit ${args.snapshot_id} --output "${args.output || `audit_${args.snapshot_id}.log`}"`,
  genos_cost_accounting: (args) => `genos cost-accounting ${args.agent_id} ${args.timeframe ? `--timeframe ${args.timeframe}` : ''}`
};

const SYNC_COMMAND_TOOLS = {
  genos_loop_detection_check: ({ history_file, exact_match = 3, stagnation = 5, similarity = 0.95 }) =>
    `genos loop-detection --history-file ${history_file} --exact-match ${exact_match} --stagnation ${stagnation} --similarity ${similarity}`,
  genos_causality_fork: ({ boundary_id, new_boundary_id }) =>
    `genos causality fork --boundary-id ${boundary_id} --new-boundary-id ${new_boundary_id}`,
  genos_incident_experiment: (args) => `genos experiment incident ${args.manifest}`,
  genos_bug_investigation: (args) => `genos experiment bug-investigation ${args.manifest}`,
  genos_phenotype_measure_divergence: ({ trait_name, expected, observed, tolerance }) =>
    `genos phenotype measure-divergence --trait-name "${trait_name}" --expected ${expected} --observed ${observed} --tolerance ${tolerance}`,
  genos_allele_frequency_analyzer: (args) => `genos swarm allele-analyzer --swarm-id ${args.swarm_id}`,
  genos_strategy_adaptation: (args) => `genos strategy adapt --agent-id ${args.agent_id} --constraint ${args.constraint} --target ${args.target_value}`,
  genos_rebase_compute_plan: ({ graph_file, injection_step, injected_keys }) => {
    const keysArgs = injected_keys.map((k) => `--injected-keys ${k}`).join(' ');
    return `genos rebase compute-plan --graph-file ${graph_file} --injection-step ${injection_step} ${keysArgs}`;
  },
  genos_guardrails_verify: ({ iteration, tokens, elapsed, uncertainty }) =>
    `genos guardrails verify --iteration ${iteration} --tokens ${tokens} --elapsed ${elapsed} --uncertainty ${uncertainty}`,
  genos_resilience_apoptosis: (args) => `genos resilience apoptosis --agent-id ${args.agent_id}`,
  genos_parasitic_pressure: (args) => `genos eval parasitic-pressure ${args.manifest}`,
  genos_bisect_agent: (args) => `genos dev bisect-agent --agent-id ${args.agent_id} --predicate "${args.predicate}"`,
  genos_hypothesis_evidence: (args) => {
    let cmd = `genos dev hypothesis-evidence ${args.diagnosis_id} ${args.hypothesis_id} --claim "${args.claim}" --source "${args.source}" --confidence ${args.confidence}`;
    if (args.artifact) cmd += ` --artifact "${args.artifact}"`;
    if (args.against) cmd += ` --against`;
    return cmd;
  },
  genos_biomimicry_skill_proceduralize: (args) => {
    const cmdParams = [`--param skill=${args.skill}`];
    if (args.successes !== undefined) cmdParams.push(`--param successes=${args.successes}`);
    if (args.failures !== undefined) cmdParams.push(`--param failures=${args.failures}`);
    if (args.variance !== undefined) cmdParams.push(`--param variance=${args.variance}`);
    if (args.failure_rate !== undefined) cmdParams.push(`--param failure_rate=${args.failure_rate}`);
    if (args.steps) args.steps.forEach((s) => cmdParams.push(`--param step=${s}`));
    if (args.preconditions) args.preconditions.forEach((p) => cmdParams.push(`--param precondition=${p}`));
    return `genos biomimicry bio-feature --feature proceduralization --action ${args.action} ${cmdParams.join(' ')}`;
  }
};

function deterministicRag(args, runLocal) {
  if (args.action === 'ingest') return runLocal(`genos platform ingest "${args.document}"` + (args.index ? ` --index "${args.index}"` : ''));
  if (args.action === 'search') return runLocal(`genos platform search "${args.query}"` + (args.index ? ` --index "${args.index}"` : ''));
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: 'Invalid action for RAG.' };
}

function replay(args, runLocal) {
  const snapshot = args.snapshot || args.snapshot_id;
  if (!snapshot) {
    return { configured: true, success: false, status: 'invalid_args', transport: 'local', error: 'Replay requires a snapshot reference.' };
  }
  return runLocal(`genos replay basic --snapshot "${snapshot}"`);
}

function causalReplayExperiment(args, runLocal, timeoutMs) {
  try {
    const outputPath = require('../../mcpExecutor').resolveMcpOutputPath(args.output_file);
    const out = runSafeSync(`genos experiment causal-replay ${args.input_file}`, timeoutMs);
    require('fs').writeFileSync(outputPath, out);
    return completed(`Causal replay report written to ${outputPath}`);
  } catch (error) {
    return failed(error);
  }
}

function complianceReport(args, runLocal, timeoutMs) {
  try {
    const outputPath = require('../../mcpExecutor').resolveMcpOutputPath(args.output_file);
    const out = runSafeSync(`genos compliance generate --standard ${args.standard}`, timeoutMs);
    require('fs').writeFileSync(outputPath, out);
    return completed(`Compliance report written to ${outputPath}`);
  } catch (error) {
    return failed(error);
  }
}

function strategyResult(res) {
  const ok = res && res.success !== false;
  return { configured: true, success: ok, status: ok ? 'completed' : 'tool_error', transport: 'strategy_primitive', output: res };
}

function fossilResult(output) {
  return { configured: true, success: output.success !== false, status: output.success === false ? 'tool_error' : 'completed', transport: 'fossilization_service', output };
}

async function fossilTool(toolName, args) {
  const fossilization = require('../../fossilizationService');
  const db = await require('../../../db').getDatabase();
  if (toolName === 'genos_fossil_record') return fossilResult(await fossilization.recordFossil({ ...args, lineage_id: args.lineage_id }, db));
  if (toolName === 'genos_fossil_list') {
    const fossils = await fossilization.listFossils(db, args);
    return fossilResult({ success: true, fossils, total: fossils.length });
  }
  if (toolName === 'genos_fossil_strata') return fossilResult({ success: true, strata: await fossilization.listStrata(db, args) });
  if (toolName === 'genos_fossil_excavate') return fossilResult(await fossilization.excavateFossil(db, args.fossil_id, args));
  if (toolName === 'genos_fossil_decode') return fossilResult(await fossilization.decodeFossil(db, args.fossil_id, args));
  if (toolName === 'genos_fossil_candidate') {
    const excavated = await fossilization.excavateFossil(db, args.fossil_id, args);
    if (!excavated.success || !excavated.integrity_verified) return fossilResult({ success: false, error: 'Fossil integrity verification failed.' });
    const innovation = require('../../agentDnaInnovation');
    return fossilResult(await innovation.captureFromFossil({
      db,
      record: { ...excavated.specimen, organization_id: args.organization_id, project_id: args.project_id },
      integrityVerified: true,
      baseGenomeRef: args.base_genome_ref
    }));
  }
  return null;
}

const fossilRecordTool = (args) => fossilTool('genos_fossil_record', args);
const fossilListTool = (args) => fossilTool('genos_fossil_list', args);
const fossilStrataTool = (args) => fossilTool('genos_fossil_strata', args);
const fossilExcavateTool = (args) => fossilTool('genos_fossil_excavate', args);
const fossilDecodeTool = (args) => fossilTool('genos_fossil_decode', args);
const fossilCandidateTool = (args) => fossilTool('genos_fossil_candidate', args);

async function synapticStdpUpdate(args) {
  const strategyExecutionAdapter = require('../../strategyExecutionAdapter');
  const primitiveArgs = {
    sourceId: firstTruthy(args.source_id, args.sourceId, args.causeId),
    targetId: firstTruthy(args.target_id, args.targetId, args.effectId),
    preSpikeAt: firstTruthy(args.pre_spike_at, args.preSpikeAt),
    postSpikeAt: firstTruthy(args.post_spike_at, args.postSpikeAt),
    learningRate: firstTruthy(args.learning_rate, args.learningRate, args.outcome_score),
    transmitterType: firstTruthy(args.transmitter_type, args.transmitterType, args.trait),
    agentId: firstTruthy(args.agent_id, args.agentId),
  };
  const res = await strategyExecutionAdapter.executePrimitive('stdp_update', primitiveArgs);
  return strategyResult(res);
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

async function pruneSynapseRows(db, args) {
  const threshold = Number(nullish(args.threshold, 0.1)) * Number(nullish(args.scale, 1.0));
  const agentId = firstTruthy(args.agent_id, args.agentId);
  const orgId = firstTruthy(args.organization_id, args.organizationId);
  const projId = firstTruthy(args.project_id, args.projectId);
  const { where, params } = synapseTenantClauses(agentId, orgId, projId);
  const sql = 'DELETE FROM memory_synapses WHERE (ABS(weight) < ? OR (c3_opsonization > 0.5 AND cd47_expression < 0.5))' + where;
  const res = await db.run(sql, threshold, ...params);
  return { prunedCount: changesOf(res), threshold, agentId };
}

async function pruneOrphanedDecisions(db, args) {
  const orgId = args.organization_id || args.organizationId;
  const projId = args.project_id || args.projectId;
  let doomedSql = `
        SELECT g.id FROM genome_decisions g
        LEFT JOIN memory_synapses s ON g.id = s.source_id OR g.id = s.target_id
        WHERE g.synaptic_weight < 0.1
      `;
  const doomedParams = [];
  if (orgId) {
    doomedSql += ' AND (g.organization_id = ? OR g.organization_id IS NULL)';
    doomedParams.push(orgId);
  }
  if (projId) {
    doomedSql += ' AND (g.project_id = ? OR g.project_id IS NULL)';
    doomedParams.push(projId);
  }
  doomedSql += `
        GROUP BY g.id
        HAVING COUNT(s.source_id) = 0 AND COUNT(s.target_id) = 0
      `;
  const doomed = await db.all(doomedSql, ...doomedParams);
  if (!doomed || doomed.length === 0) return 0;
  const doomedIds = doomed.map((d) => d.id);
  const placeholders = doomedIds.map(() => '?').join(',');
  const delRes = await db.run(`DELETE FROM genome_decisions WHERE id IN (${placeholders})`, ...doomedIds);
  return delRes?.changes || doomedIds.length;
}

async function synapticPruneScale(args) {
  const db = await require('../../../db').getDatabase();
  let prunedCount = 0;
  let orphanedPruned = 0;
  let threshold = Number(args.threshold ?? 0.1) * Number(args.scale ?? 1.0);
  let agentId = args.agent_id || args.agentId;
  if (db) {
    const pruned = await pruneSynapseRows(db, args);
    prunedCount = pruned.prunedCount;
    threshold = pruned.threshold;
    agentId = pruned.agentId;
    orphanedPruned = await pruneOrphanedDecisions(db, args);
  }
  return { configured: true, success: true, status: 'completed', transport: 'strategy_primitive', output: { success: true, prunedSynapses: prunedCount, orphanedDecisionsPruned: orphanedPruned, threshold, agent_id: agentId || 'global' } };
}

async function computerUse(args) {
  try {
    const computerUseService = require('../../computerUseService');
    const output = await computerUseService.runMission(args.prompt || args.task || args.instruction, { model: args.model, maxIterations: args.max_iterations });
    return { configured: true, success: true, status: 'completed', transport: 'strategy_primitive', output };
  } catch (error) {
    return { configured: true, success: false, status: 'tool_error', transport: 'strategy_primitive', output: error.message };
  }
}

async function hippocampalConsolidate(args, runLocal, timeoutMs) {
  const episodicMemoryService = require('../../episodicMemoryService');
  try {
    const score = Number.isFinite(Number(args.success_score)) ? Number(args.success_score) : 1.0;
    let consolidationResult = null;
    try {
      consolidationResult = await episodicMemoryService.consolidateEpisodes({
        agentId: args.agent_id, sessionId: args.session_id,
        scoreThreshold: score >= 0.7 ? score : 0.7, purgeBelowThreshold: args.purge_failed !== false
      });
    } catch (err) {}
    const episodesCount = consolidationResult?.totalProcessed || 1;
    const steps = (args.dag_step || []).map((s) => `--param dag_step=${s}`).join(' ');
    const out = runSafeSync(`genos biomimicry bio-feature --feature hippocampal --action consolidate --param agent_id=${args.agent_id} --param success_score=${score} --param episodes_count=${episodesCount} ${steps}`, timeoutMs);
    return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString(), consolidation: consolidationResult };
  } catch (error) {
    return failed(error);
  }
}

function factsContainViolation(facts) {
  for (const fact of facts) {
    const factStr = String(fact).toLowerCase();
    if (factStr.includes('error') || factStr.includes('failed') || factStr.includes('violation')) return true;
  }
  return false;
}

function gateEvaluate(args) {
  try {
    const facts = Array.isArray(args.facts) ? args.facts : [];
    const invariantVerified = !factsContainViolation(facts);
    const verdict = invariantVerified ? 'PERMITTED' : 'DENIED';
    const cmdParams = [`--param phase=${args.phase}`];
    if (args.facts) args.facts.forEach((f) => cmdParams.push(`"${f}"`));
    return { configured: true, success: invariantVerified, status: invariantVerified ? 'completed' : 'tool_error', transport: 'local', output: JSON.stringify({ success: invariantVerified, feature: "gate", action: "evaluate", params: cmdParams, invariant_verified: invariantVerified, verdict: verdict }) };
  } catch (error) {
    return failed(error);
  }
}

const CUSTOM_TOOL_HANDLERS = {
  genos_biological_mode: (args) => require('../../topologyMcpTools').composeBiologicalMode(args),
  genos_topology_session: (args) => require('../../topologyMcpTools').operateTopologySession(args),
  genos_deterministic_sha256_rag: deterministicRag,
  genos_replay: replay,
  genos_causal_replay_experiment: causalReplayExperiment,
  genos_compliance_report: complianceReport,
  genos_synaptic_stdp_update: synapticStdpUpdate,
  genos_synaptic_prune_scale: synapticPruneScale,
  genos_computer_use: computerUse,
  genos_biomimicry_hippocampal_consolidate: hippocampalConsolidate,
  genos_biomimicry_gate_evaluate: gateEvaluate,
  genos_fossil_record: fossilRecordTool,
  genos_fossil_list: fossilListTool,
  genos_fossil_strata: fossilStrataTool,
  genos_fossil_excavate: fossilExcavateTool,
  genos_fossil_decode: fossilDecodeTool
  ,genos_fossil_candidate: fossilCandidateTool
};

async function dispatchToTransport(toolName, args, timeoutMs) {
  const bioResult = await require('../../mcpBioTools').executeBioTool(toolName, args, { timeoutMs });
  if (bioResult) return bioResult;
  const stratResult = await require('../../mcpStrategyTools').executeStrategyTool(toolName, args, { timeoutMs });
  if (stratResult) return stratResult;
  const transport = require('../../mcpExecutor').configuredTransport();
  if (transport && transport.type === 'invalid') return { configured: false, success: false, status: 'invalid_config', error: transport.error };
  if (!transport) return { configured: false, success: false, status: 'unavailable', error: 'No MCP transport configured. Set GENOS_MCP_URL or GENOS_MCP_COMMAND.' };
  const result = transport.type === 'http'
    ? await require('./http').callHttpFn(transport.url, toolName, { args, timeoutMs })
    : await require('./stdio').callStdioFn(transport, toolName, { args, timeoutMs });
  const isError = result.isError === true;
  return { configured: true, success: !isError, status: isError ? 'tool_error' : 'completed', transport: transport.type, output: firstNonNull(result.structuredContent, result.content, result) };
}

async function executeToolLogic(toolName, args, context = {}) {
  const { runLocal, timeoutMs = 30000 } = context;
  // Re-validation fail-closed: ne jamais faire confiance à preValidated.
  const revalidation = revalidateToolCall(toolName, args);
  if (revalidation) return revalidation;
  const genomeResult = await require('../../mcpGenomeTools').executeGenomeTool(toolName, args, runLocal);
  if (genomeResult) return genomeResult;
  const commandBuilder = LOCAL_COMMAND_TOOLS[toolName];
  if (commandBuilder) return runLocal(commandBuilder(args));
  const syncBuilder = SYNC_COMMAND_TOOLS[toolName];
  if (syncBuilder) return runSyncResult(() => syncBuilder(args), timeoutMs);
  const customHandler = CUSTOM_TOOL_HANDLERS[toolName];
  if (customHandler) return customHandler(args, runLocal, timeoutMs);
  return dispatchToTransport(toolName, args, timeoutMs);
}

module.exports = { executeToolLogic };
