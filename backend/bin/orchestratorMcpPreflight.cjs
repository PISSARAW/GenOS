'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const PREFLIGHT_TOOLS = new Set(['genos_snapshot', 'genos_search_failures', 'genos_diagnose', 'genos_record_decision']);
const BASELINE_TOOLS = new Set(['genos_search_failures', 'genos_diagnose', 'genos_snapshot']);

function baselineTools(plan) {
  const planned = (plan?.phases || []).flatMap(phase => phase.requiredTools || []);
  return [...new Set(planned)].filter(tool => BASELINE_TOOLS.has(tool));
}

function safeSegment(value) {
  return crypto.createHash('sha256').update(String(value || 'mission')).digest('hex').slice(0, 24);
}

function resultText(result) {
  return (result?.content || []).filter(item => item.type === 'text').map(item => item.text).join('\n');
}

function parseResult(result) {
  const text = resultText(result);
  if (!text) return { text, value: null };
  try { return { text, value: JSON.parse(text) }; } catch (_) { return { text, value: text }; }
}

function assertSuccessfulTool(tool, result, extra = {}) {
  if (!result || result.isError === true) {
    throw Object.assign(new Error(`GenOS preflight tool '${tool}' failed: ${resultText(result) || 'empty MCP result'}`),
      { code: 'ORCHESTRATOR_PREFLIGHT_TOOL_FAILED', tool });
  }
  const parsed = parseResult(result);
  if (!parsed.value || typeof parsed.value !== 'object' || parsed.value.success !== true) {
    throw Object.assign(new Error(`GenOS preflight tool '${tool}' did not attest success=true.`),
      { code: 'ORCHESTRATOR_PREFLIGHT_TOOL_FAILED', tool });
  }
  return { text: parsed.text, value: parsed.value, ...extra };
}

function snapshotAgentPath(root, requested) {
  const candidates = [requested,
    'agents/securite/snapshot_integrity_guardian.agent.json',
    'arch_agent.json'];
  for (const candidate of candidates) {
    if (!candidate || path.isAbsolute(candidate)) continue;
    const resolved = path.resolve(root, candidate);
    const relative = path.relative(path.resolve(root), resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) continue;
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      return { absolute: resolved, relative: relative.replaceAll(path.sep, '/') };
    }
  }
  throw Object.assign(new Error('The workspace has no GenOS agent file for the required baseline snapshot.'),
    { code: 'ORCHESTRATOR_PREFLIGHT_SNAPSHOT_AGENT_MISSING' });
}

async function runOrchestratorMcpPreflight(input) {
  assertPreflightContext(input);
  const tools = [...new Set(input.tools || [])].filter(tool => PREFLIGHT_TOOLS.has(tool));
  if (!tools.length) return { observedTools: [], receipts: [] };
  const client = await connectPreflightClient(input, tools);
  const receipts = [];
  try {
    for (const tool of tools) receipts.push(await runPreflightTool({ client, input, tool, receipts }));
  } finally {
    await client.close().catch(() => {});
  }
  return { observedTools: receipts.map(receipt => receipt.tool), receipts };
}

function buildOrchestratorPreflightInput(input) {
  const request = input.request || {};
  return { db: input.db, orchestratorId: input.orchestratorId, missionId: input.missionId,
    task: input.task, repoRoot: input.repoRoot,
    workspaceRoot: request.workspaceRoot || request.workspace_root || input.workspaceRoot,
    snapshotAgent: request.preflightSnapshotAgent || request.preflight_snapshot_agent || input.snapshotAgent,
    hypotheses: request.diagnosticHypotheses || request.hypotheses, tools: input.tools };
}
function assertPreflightContext(input) {
  const { db, orchestratorId, missionId, repoRoot, workspaceRoot } = input || {};
  if (!db || !orchestratorId || !missionId || !repoRoot || !workspaceRoot) {
    throw Object.assign(new Error('Orchestrator MCP preflight context is incomplete.'),
      { code: 'ORCHESTRATOR_PREFLIGHT_CONTEXT_INVALID' });
  }
}

function preflightEnvironment(input, tools) {
  const environment = { ...process.env };
  delete environment.GENOS_ORCHESTRATOR_AGENT_ID;
  if (input.orchestratorId) environment.GENOS_ORCHESTRATOR_AGENT_ID = input.orchestratorId;
  return { ...environment, GENOS_REPO_ROOT: input.repoRoot, GENOS_WORKSPACE_ROOT: input.workspaceRoot,
    GENOS_AGENT_ID: input.orchestratorId, GENOS_MCP_LEASE: tools.join(','), GENOS_DISABLE_DOTENV: '1' };
}

async function connectPreflightClient(input, tools) {
  const { repoRoot } = input;
  const sdkRoot = path.join(repoRoot, 'mcp', 'node_modules', '@modelcontextprotocol', 'sdk');
  const [{ Client }, { StdioClientTransport }] = await Promise.all([
    import(pathToFileURL(path.join(sdkRoot, 'dist', 'esm', 'client', 'index.js'))),
    import(pathToFileURL(path.join(sdkRoot, 'dist', 'esm', 'client', 'stdio.js')))
  ]);
  const cli = path.join(repoRoot, 'target', 'debug', process.platform === 'win32' ? 'genos.exe' : 'genos');
  const env = preflightEnvironment(input, tools);
  if (fs.existsSync(cli)) env.GENOS_BIN = cli;
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [path.join(repoRoot, 'mcp', 'index.js')], cwd: repoRoot, stderr: 'pipe', env });
  const stderrPath = path.join(repoRoot, '.genos', 'runner-logs', 'mcp-preflight-' + safeSegment(input.missionId) + '.stderr.log');
  fs.mkdirSync(path.dirname(stderrPath), { recursive: true });
  transport.stderr.on('data', chunk => fs.appendFileSync(stderrPath, chunk));
  const client = new Client({ name: 'genos-orchestrator-preflight', version: '1' });
  await client.connect(transport);
  return client;
}

async function runPreflightTool(request) {
  const { client, input, tool, receipts = [] } = request;
  const prepared = prepareToolArguments(input, tool, receipts);
  const result = await client.callTool({ name: tool, arguments: prepared.args });
  const success = assertSuccessfulTool(tool, result, { outputPath: prepared.outputPath });
  assertSnapshotExists(tool, prepared.outputPath);
  const receipt = createReceipt({ input, tool, prepared, resultTextValue: success.text });
  await recordPreflightSuccess(input.db, receipt, prepared.args);
  return receipt;
}

function prepareToolArguments(input, tool, receipts = []) {
  if (tool === 'genos_search_failures') return {
    args: { query: String(input.task || 'GenOS orchestration preflight').slice(0, 2000), limit: 10 },
    outputPath: null
  };
  if (tool === 'genos_diagnose') {
    const task = String(input.task || 'GenOS orchestration preflight').slice(0, 2000);
    const supplied = Array.isArray(input.hypotheses) ? input.hypotheses
      .filter(hypothesis => typeof hypothesis?.statement === 'string' && hypothesis.statement.trim()) : [];
    const hypotheses = supplied.length ? supplied : [{
      statement: `The authorized workspace contains at least one change relevant to this objective, and its effect can be independently verified: ${task}`
    }];
    return { args: { task, hypotheses }, outputPath: null };
  }
  if (tool === 'genos_record_decision') {
    const evidence = receipts.filter(receipt => receipt.status === 'completed')
      .map(receipt => `mcp:${receipt.tool}:${receipt.resultDigest}`);
    if (!evidence.length) throw Object.assign(new Error('A baseline decision requires completed preflight evidence.'),
      { code: 'ORCHESTRATOR_PREFLIGHT_DECISION_EVIDENCE_MISSING' });
    return { args: { agentId: input.orchestratorId,
      title: `Baseline decision: ${String(input.task || 'GenOS mission').slice(0, 80)}`,
      decision: 'Proceed with the bounded mission using the completed failure search, falsifiable diagnosis, and baseline snapshot. Reassess if new evidence contradicts this plan.',
      evidence }, outputPath: null };
  }
  const agent = snapshotAgentPath(input.repoRoot, input.snapshotAgent);
  const relativeOutput = `.genos-agent-worlds/orchestrator-preflight/${safeSegment(input.missionId)}.snapshot.json`;
  const outputPath = path.join(input.repoRoot, ...relativeOutput.split('/'));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  return { args: { agent: agent.relative, out: relativeOutput }, outputPath };
}

function assertSnapshotExists(tool, outputPath) {
  if (tool === 'genos_snapshot' && (!outputPath || !fs.existsSync(outputPath))) {
    throw Object.assign(new Error('genos_snapshot returned without creating its requested baseline file.'),
      { code: 'ORCHESTRATOR_PREFLIGHT_SNAPSHOT_MISSING', tool });
  }
}

function createReceipt({ input, tool, prepared, resultTextValue }) {
  return { tool, status: 'completed',
    resultDigest: crypto.createHash('sha256').update(resultTextValue).digest('hex'), args: prepared.args,
    outputPath: prepared.outputPath, stageKey: input.stageKey || `preflight:${input.missionId}`,
    missionId: input.missionId, orchestratorId: input.orchestratorId };
}

async function recordPreflightSuccess(db, receipt, args) {
  await require('../src/services/primitiveExecutionJournal').recordPrimitiveExecution(db, {
    orchestratorId: receipt.orchestratorId, agentId: receipt.orchestratorId,
    stageKey: receipt.stageKey || `preflight:${receipt.missionId}`, primitive: receipt.tool, args,
    result: { success: true, resultDigest: receipt.resultDigest, outputPath: receipt.outputPath }
  });
  require('../src/services/telemetryObserver').emitEvent({ eventType: receipt.stageKey?.startsWith('postflight:')
    ? 'ORCHESTRATOR_POSTFLIGHT_TOOL_COMPLETED' : 'ORCHESTRATOR_PREFLIGHT_TOOL_COMPLETED',
    agentId: receipt.orchestratorId, action: receipt.tool,
    detail: `Required MCP preflight tool ${receipt.tool} completed before worker dispatch.`,
    severity: 'info', payload: receipt });
}

function parseWorkerEvidence(db, agentId, executionRunId) {
  return db.all(`SELECT event_type, payload_json FROM telemetry_events
    WHERE agent_id = ? AND event_type IN ('AGENT_COMPLETED', 'AGENT_FAILED', 'AGENT_HALTED',
      'LOCAL_WORKER_COMPLETED', 'LOCAL_WORKER_FAILED')
    ORDER BY created_at DESC LIMIT 100`, agentId).then(rows => {
    for (const row of rows) {
      let payload;
      try { payload = JSON.parse(row.payload_json || '{}'); } catch (_) { continue; }
      const eventType = normalizeWorkerTerminalEvent(row.event_type, payload);
      if (payload.executionRunId === executionRunId && eventType) return { eventType, payload };
    }
    return null;
  });
}

function normalizeWorkerTerminalEvent(eventType, payload) {
  if (!eventType.startsWith('LOCAL_WORKER_')) return eventType;
  const terminal = payload.deferredTerminalEventType;
  return ['AGENT_COMPLETED', 'AGENT_FAILED', 'AGENT_HALTED'].includes(terminal) ? terminal : null;
}

function successfulTestCount(payload) {
  const tests = Array.isArray(payload?.proposal?.tests) ? payload.proposal.tests
    : Array.isArray(payload?.proposalTests) ? payload.proposalTests
      : Array.isArray(payload?.evidenceReport?.tests) ? payload.evidenceReport.tests : [];
  return { tests, passed: tests.filter(test => Number(test.exitCode) === 0).length };
}

function evidenceForWorker(payload, eventType) {
  const { tests } = successfulTestCount(payload);
  const evidence = tests.map((test, index) => ({
    id: `test-${index + 1}`,
    statement: `${String(test.command || 'worker test')} ${Number(test.exitCode) === 0 ? 'passed' : 'failed'}`,
    exitCode: Number(test.exitCode)
  }));
  if (payload.nativeOracleRef) evidence.push({ id: payload.nativeOracleRef,
    statement: `independent oracle ${eventType === 'AGENT_COMPLETED' ? 'passed' : 'failed'}` });
  if (payload.evidenceReport?.fullText) evidence.push({ id: `worker-report-${payload.executionRunId}`,
    statement: payload.evidenceReport.fullText.slice(0, 1000) });
  if (!evidence.length && payload.workerArtifactDiagnostics) evidence.push({
    id: `worker-failure-${payload.executionRunId}`,
    statement: JSON.stringify(payload.workerArtifactDiagnostics).slice(0, 1000), category: 'counterexample'
  });
  return evidence;
}

function assertReplayProof(parsed) {
  if (parsed.value?.replay_status !== 'VERIFIED' || parsed.value?.execution_replayed !== true) {
    throw Object.assign(new Error('GenOS replay did not verify an executed reproduction.'),
      { code: 'ORCHESTRATOR_POSTFLIGHT_REPLAY_UNVERIFIED', tool: 'genos_replay' });
  }
}

async function runOrchestratorMcpPostflight(input) {
  assertPreflightContext(input);
  const state = await resolvePostflightState(input);
  const receipts = await runPostflightPipeline(input, state);
  receipts.push(...await runPostflightReplayAndDecision(input, state));
  return { observedTools: receipts.map(receipt => receipt.tool), receipts };
}

function requiredPostflightInput(input) {
  const executionRunId = input.localResult?.executionRun?.id;
  if (!executionRunId) throw Object.assign(new Error('The local worker returned no execution run for postflight evidence.'),
    { code: 'ORCHESTRATOR_POSTFLIGHT_WORKER_RUN_MISSING' });
  const receipts = input.preflight?.receipts || [];
  const hypotheses = receipts.find(item => item.tool === 'genos_diagnose')?.args?.hypotheses;
  if (!Array.isArray(hypotheses) || !hypotheses.length) throw Object.assign(new Error('No persisted preflight hypotheses are available for evidence evaluation.'),
    { code: 'ORCHESTRATOR_POSTFLIGHT_HYPOTHESES_MISSING' });
  const snapshot = receipts.find(item => item.tool === 'genos_snapshot');
  if (!snapshot?.outputPath || !fs.existsSync(snapshot.outputPath)) throw Object.assign(new Error('The preflight snapshot is missing; replay is blocked.'),
    { code: 'ORCHESTRATOR_POSTFLIGHT_SNAPSHOT_MISSING' });
  return { executionRunId, hypotheses, snapshot };
}

async function resolvePostflightState(input) {
  const state = requiredPostflightInput(input);
  const worker = await parseWorkerEvidence(input.db, input.orchestratorId, state.executionRunId);
  if (!worker) throw Object.assign(new Error('No terminal worker evidence was persisted for postflight evaluation.'),
    { code: 'ORCHESTRATOR_POSTFLIGHT_WORKER_EVIDENCE_MISSING' });
  const { tests, passed } = successfulTestCount(worker.payload);
  return { ...state, worker, tests, passed, evidence: evidenceForWorker(worker.payload, worker.eventType) };
}

function pipelineArguments(input, state, primitive) {
  const candidates = [{ id: state.executionRunId,
    quality: state.tests.length > 0 && state.passed === state.tests.length ? 1 : 0,
    latencyMs: Number(input.workerElapsedMs) || 0 }];
  return { primitives: [primitive], context: {
    agentId: input.orchestratorId, orchestratorId: input.orchestratorId,
    missionId: input.missionId, task: input.task, hypotheses: state.hypotheses,
    evidence: state.evidence, candidates, objectives: ['quality', 'latencyMs'],
    directions: { quality: 'max', latencyMs: 'min' }
  } };
}

async function runPipelinePrimitive({ input, state, client, primitive }) {
  const args = pipelineArguments(input, state, primitive);
  const raw = await client.callTool({ name: 'genos_execute_strategy_pipeline', arguments: args });
  const tool = primitive === 'hypothesis_evidence' ? 'genos_hypothesis_evidence' : 'genos_evaluate_trajectories';
  const parsed = assertSuccessfulTool(tool, raw);
  const primitiveResult = parsed.value.results?.[0]?.result;
  if (parsed.value.success !== true || primitiveResult?.success !== true) {
    throw Object.assign(new Error(`GenOS ${primitive} did not produce a successful result.`),
      { code: 'ORCHESTRATOR_POSTFLIGHT_PRIMITIVE_FAILED', tool: primitive });
  }
  const receipt = createReceipt({ input: { ...input, stageKey: `postflight:${input.missionId}` },
    tool, prepared: { args, outputPath: null }, resultTextValue: parsed.text });
  await recordPreflightSuccess(input.db, receipt, args);
  return receipt;
}

async function runPostflightPipeline(input, state) {
  const client = await connectPreflightClient(input, ['genos_execute_strategy_pipeline']);
  const receipts = [];
  try {
    for (const primitive of ['hypothesis_evidence', 'evaluate_trajectories']) {
      receipts.push(await runPipelinePrimitive({ input, state, client, primitive }));
    }
  } finally {
    await client.close().catch(() => {});
  }
  return receipts;
}

function snapshotReference(input, state) {
  return path.relative(input.repoRoot, state.snapshot.outputPath).split(path.sep).join('/');
}

async function runSnapshotReplay(input, state, client) {
  const snapshotRef = snapshotReference(input, state);
  const args = { snapshot: snapshotRef };
  const raw = await client.callTool({ name: 'genos_replay', arguments: args });
  const replay = assertSuccessfulTool('genos_replay', raw);
  assertReplayProof(replay);
  const receipt = createReceipt({ input: { ...input, stageKey: `postflight:${input.missionId}` },
    tool: 'genos_replay', prepared: { args, outputPath: state.snapshot.outputPath }, resultTextValue: replay.text });
  await recordPreflightSuccess(input.db, receipt, args);
  return { receipt, snapshotRef };
}

function postflightDecisionArguments({ input, state, snapshotRef, replayReceipt }) {
  const passedAll = state.tests.length > 0 && state.passed === state.tests.length;
  return { agentId: input.orchestratorId,
    title: `Local mission ${input.missionId} postflight decision`,
    decision: state.worker.eventType === 'AGENT_COMPLETED' && passedAll
      ? 'Accept the local worker result for mission review; this record does not promote or merge the patch.'
      : 'Retain the local worker failure or incomplete test result; do not claim a repaired mission.',
    evidence: [`execution-run:${state.executionRunId}`, `snapshot:${snapshotRef}`,
      `replay:${replayReceipt.resultDigest}`,
      ...state.evidence.map(item => `worker-evidence:${item.id}`)] };
}

async function runPostflightDecision({ input, state, client, snapshotRef, replayReceipt }) {
  const args = postflightDecisionArguments({ input, state, snapshotRef, replayReceipt });
  const raw = await client.callTool({ name: 'genos_record_decision', arguments: args });
  const decision = assertSuccessfulTool('genos_record_decision', raw);
  if (decision.value.persisted !== true || decision.value.promoted !== false) {
    throw Object.assign(new Error('GenOS decision was not persisted as a non-promoting record.'),
      { code: 'ORCHESTRATOR_POSTFLIGHT_DECISION_UNVERIFIED', tool: 'genos_record_decision' });
  }
  const receipt = createReceipt({ input: { ...input, stageKey: `postflight:${input.missionId}` },
    tool: 'genos_record_decision', prepared: { args, outputPath: null }, resultTextValue: decision.text });
  await recordPreflightSuccess(input.db, receipt, args);
  return receipt;
}

async function runPostflightReplayAndDecision(input, state) {
  const client = await connectPreflightClient(input, ['genos_replay', 'genos_record_decision']);
  try {
    const replay = await runSnapshotReplay(input, state, client);
    const decision = await runPostflightDecision({ input, state, client, snapshotRef: replay.snapshotRef,
      replayReceipt: replay.receipt });
    return [replay.receipt, decision];
  } finally {
    await client.close().catch(() => {});
  }
}

function pathToFileURL(filePath) {
  return require('node:url').pathToFileURL(filePath).href;
}

module.exports = { runOrchestratorMcpPreflight, snapshotAgentPath, assertSuccessfulTool,
  runOrchestratorMcpPostflight, assertPreflightContext, preflightEnvironment,
  prepareToolArguments, PREFLIGHT_TOOLS, assertReplayProof, evidenceForWorker, baselineTools,
  parseWorkerEvidence, normalizeWorkerTerminalEvent, buildOrchestratorPreflightInput };
