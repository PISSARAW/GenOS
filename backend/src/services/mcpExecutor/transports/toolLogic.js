const { runGenosSync } = require('../../genosCli');
const { localCommandFor, syncCommandFor } = require('./toolCommandDispatch');

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

function revalidateToolCall(toolName, args, scopedReplayAllowed = false) {
  const { directToolLeaseAllows } = require('../../mcpExecutor/config');
  const { validateToolArguments, validateScopedReplayArguments } = require('../../mcpArgumentValidation');
  const scopedReplay = toolName === 'genos_replay' && scopedReplayAllowed === true
    && require('../../mcpExecutor/config').scopedWorkerReplayLeaseOpen();
  if (!directToolLeaseAllows(toolName) && !scopedReplay) {
    return { configured: false, success: false, status: 'lease_denied', error: `Tool '${toolName}' is outside the active MCP lease.`, code: 'MCP_TOOL_LEASE_DENIED' };
  }
  const argumentError = scopedReplay
    ? validateScopedReplayArguments(args || {})
    : validateToolArguments(toolName, args || {});
  if (argumentError) {
    return { configured: true, success: false, status: 'invalid_args', error: argumentError.message, code: argumentError.code };
  }
  const circuit = require('../../circuitBreaker').canExecute(toolName, 'operator', 'global', args);
  if (!circuit.allowed) {
    return { configured: true, success: false, status: 'circuit_open', error: circuit.message, code: circuit.reason || 'MCP_CIRCUIT_OPEN' };
  }
  return null;
}

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
  const success = output?.success === true;
  return { configured: true, success, status: success ? 'completed' : 'tool_error',
    transport: 'fossilization_service', error: success ? undefined : output?.error || 'Fossil operation did not complete.', output };
}

function fossilCandidateResult(output) {
  const success = Boolean(output?.candidateGenomeRef && ['candidate', 'evaluated'].includes(output.status));
  const status = success ? 'candidate' : output?.status === 'skipped' ? 'capability_unavailable' : 'tool_error';
  return { configured: true, success, status, transport: 'fossilization_service',
    error: success ? undefined : output?.reason || output?.error || 'No candidate was created.', output };
}

async function fossilTool(toolName, args) {
  const fossilization = require('../../fossilizationService');
  const db = await require('../../../db').getDatabase();
  if (toolName === 'genos_fossil_record') return fossilResult(await fossilization.recordFossil(args, db));
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
    return fossilCandidateResult(await innovation.captureFromFossil({
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
    const consolidationResult = await episodicMemoryService.consolidateEpisodes({
      agentId: args.agent_id, sessionId: args.session_id,
      organizationId: args.organization_id, projectId: args.project_id,
      scoreThreshold: score >= 0.7 ? score : 0.7, purgeBelowThreshold: args.purge_failed !== false
    });
    const episodesCount = consolidationResult.totalProcessed;
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
  genos_biological_mode: (...call) => require('../../topologyMcpTools')
    .composeBiologicalMode(call[0], { agentId: call[3]?.agentId, tenant: call[3]?.tenant }),
  genos_topology_session: (...call) => require('../../topologyMcpTools').operateTopologySession(call[0], call[3]),
  genos_deterministic_sha256_rag: deterministicRag,
  genos_replay: replay,
  genos_causal_replay_experiment: causalReplayExperiment,
  genos_compliance_report: complianceReport,
  genos_synaptic_stdp_update: synapticStdpUpdate,
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

async function dispatchToTransport(input) {
  const { toolName, args, timeoutMs, context = {} } = input;
  const caller = { agentId: context.agentId || null, tenant: context.tenant || null };
  const bioResult = await require('../../mcpBioTools').executeBioTool(toolName, args, { timeoutMs, caller });
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
  const revalidation = revalidateToolCall(toolName, args, context.scopedReplayAllowed);
  if (revalidation) return revalidation;
  const delegated = await executeDelegatedTool({ toolName, args, context });
  if (delegated !== UNHANDLED) return delegated;
  const local = await executeLocalTool({ toolName, args, context, runLocal, timeoutMs });
  if (local !== UNHANDLED) return local;
  return dispatchToTransport({ toolName, args, timeoutMs, context });
}

const UNHANDLED = Symbol('unhandled-tool');

async function executeDelegatedTool({ toolName, args, context }) {
  if (toolName === 'genos_delegate_worker') {
    if (!context.agentId) return { configured: true, success: false, status: 'denied', code: 'WORKER_CALLER_REQUIRED', error: 'An authenticated worker caller is required.' };
    return require('../../agents/subOrchestratorDispatchService').dispatchSubOrchestratorWorker(context.db, context.agentId, args);
  }
  if (toolName !== 'genos_synaptic_prune_scale') return UNHANDLED;
  return require('../../mcpStrategyTools').executeStrategyTool(toolName, args || {}, { agentId: context.agentId });
}

async function executeLocalTool({ toolName, args, context, runLocal, timeoutMs }) {
  const genomeResult = await require('../../mcpGenomeTools').executeGenomeTool(toolName, args, runLocal);
  if (genomeResult) return genomeResult;
  const command = localCommandFor(toolName, args);
  if (command !== null) return runLocal(command);
  return executeConfiguredHandler({ toolName, args, context, runLocal, timeoutMs });
}

function executeConfiguredHandler({ toolName, args, context, runLocal, timeoutMs }) {
  const syncCommand = syncCommandFor(toolName, args);
  if (syncCommand !== null) return runSyncResult(syncCommand, timeoutMs);
  return customToolHandler({ toolName, args, runLocal, timeoutMs, context });
}

function customToolHandler({ toolName, args, runLocal, timeoutMs, context }) {
  const fossil = fossilToolHandler(toolName, args, runLocal);
  if (fossil !== UNHANDLED) return fossil;
  const bio = biologicalToolHandler({ toolName, args, runLocal, timeoutMs, context });
  if (bio !== UNHANDLED) return bio;
  return platformToolHandler({ toolName, args, runLocal, timeoutMs });
}

function fossilToolHandler(toolName, args, runLocal) {
  switch (toolName) {
    case 'genos_fossil_record': return fossilRecordTool(args, runLocal);
    case 'genos_fossil_list': return fossilListTool(args, runLocal);
    case 'genos_fossil_strata': return fossilStrataTool(args, runLocal);
    case 'genos_fossil_excavate': return fossilExcavateTool(args, runLocal);
    case 'genos_fossil_decode': return fossilDecodeTool(args, runLocal);
    case 'genos_fossil_candidate': return fossilCandidateTool(args, runLocal);
    default: return UNHANDLED;
  }
}

function biologicalToolHandler({ toolName, args, runLocal, timeoutMs, context }) {
  switch (toolName) {
    case 'genos_biological_mode': return CUSTOM_TOOL_HANDLERS.genos_biological_mode(args, runLocal, timeoutMs, context);
    case 'genos_topology_session': return CUSTOM_TOOL_HANDLERS.genos_topology_session(args, runLocal, timeoutMs, context);
    case 'genos_synaptic_stdp_update': return synapticStdpUpdate(args, runLocal);
    case 'genos_biomimicry_hippocampal_consolidate': return hippocampalConsolidate(args, runLocal);
    case 'genos_biomimicry_gate_evaluate': return gateEvaluate(args, runLocal);
    default: return UNHANDLED;
  }
}

function platformToolHandler({ toolName, args, runLocal, timeoutMs }) {
  switch (toolName) {
    case 'genos_deterministic_sha256_rag': return deterministicRag(args, runLocal);
    case 'genos_replay': return replay(args, runLocal);
    case 'genos_causal_replay_experiment': return causalReplayExperiment(args, runLocal, timeoutMs);
    case 'genos_compliance_report': return complianceReport(args, runLocal, timeoutMs);
    case 'genos_computer_use': return computerUse(args, runLocal);
    default: return UNHANDLED;
  }
}

module.exports = { executeToolLogic, revalidateToolCall };
