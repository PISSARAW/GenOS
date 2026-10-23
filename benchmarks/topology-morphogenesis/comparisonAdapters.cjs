'use strict';
const { performance } = require('perf_hooks');
const provenance = require('./comparisonProvenance.cjs');
function endpointUrl() {
  return process.env.GENOS_COMPARISON_OLLAMA_URL || 'http://127.0.0.1:11434/api/chat';
}
function requestedModel() {
  return process.env.GENOS_COMPARISON_MODEL || 'qwen2.5-coder:7b';
}

function deadlineMs(budget) {
  return Number(budget.latencyMs);
}

function remainingTokens(budget, used) {
  return Math.max(0, Number(budget.tokens) - used);
}

async function modelCall(prompt, state) {
  const left = remainingTokens(state.budget, state.tokensUsed);
  const inputReserve = Math.ceil(Buffer.byteLength(prompt, 'utf8') / 2);
  const outputLimit = Math.min(2048, left - inputReserve);
  const msLeft = deadlineMs(state.budget) - (Date.now() - state.startedAt);
  if (outputLimit < 1 || msLeft < 1) throw new Error('Shared token or latency budget exhausted.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), msLeft);
  const started = performance.now();
  state.meteringComplete = false;
  state.messageCount += 1;
  try {
    const response = await fetch(endpointUrl(), {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ model: state.model, stream: false, format: 'json',
        options: { num_predict: outputLimit, temperature: 0 }, messages: [{ role: 'user', content: prompt }] })
    });
    if (!response.ok) throw new Error(`Model endpoint returned HTTP ${response.status}.`);
    const body = await response.json();
    const promptTokens = Number(body.prompt_eval_count);
    const completionTokens = Number(body.eval_count);
    if (!Number.isInteger(promptTokens) || !Number.isInteger(completionTokens)) {
      throw new Error('Model endpoint did not report measured prompt and completion tokens.');
    }
    const actual = promptTokens + completionTokens;
    state.tokensUsed += actual;
    state.promptTokens += promptTokens;
    state.completionTokens += completionTokens;
    state.servedModels.add(String(body.model || 'unknown'));
    state.meteringComplete = true;
    if (state.tokensUsed > state.budget.tokens) throw new Error('Shared token budget was exceeded.');
    return { text: String(body.message?.content || ''), tokens: actual, servedModel: body.model || null,
      promptTokens, completionTokens, latencyMs: performance.now() - started };
  } finally { clearTimeout(timer); }
}

function taskInstruction(task) {
  return `${task.prompt}\nRéponds uniquement par l'objet JSON demandé. N'utilise aucun outil.`;
}

function topologyProfile(task) {
  const shape = String(task.routingHint || 'single').toLowerCase();
  return ['parallel', 'search', 'dependencies'].includes(shape) ? 'team' : 'single';
}

function rolePrompt(task, role, prior) {
  return `Tâche: ${task.prompt}\nRôle: ${role}.\n${prior ? `Travail précédent à examiner:\n${prior}\n` : ''}`
    + 'Retourne uniquement une réponse JSON, avec les calculs ou contraintes utiles. Aucun outil.';
}

async function direct(task, state) {
  return modelCall(taskInstruction(task), state);
}

async function fixedTeam(task, state) {
  const roles = ['résolution indépendante', 'vérification des contraintes', 'recherche d’omissions'];
  let prior = '';
  const workers = [];
  for (const role of roles) {
    const result = await modelCall(rolePrompt(task, role, prior), state);
    workers.push(result);
    prior += `\n${role}: ${result.text}`;
  }
  const synthesis = await modelCall(`Tâche: ${task.prompt}\nContributions:\n${prior}\n`
    + 'Synthétise sans inventer. Retourne uniquement le JSON demandé.', state);
  return { ...synthesis, workers, route: 'fixed-team' };
}

async function communicationLight(task, state) {
  const roles = ['solution', 'contre-vérification', 'contrôle d’exhaustivité'];
  const workers = [];
  for (const role of roles) workers.push(await modelCall(rolePrompt(task, role, ''), state));
  const synthesis = await modelCall(`Tâche: ${task.prompt}\nContributions indépendantes:\n`
    + workers.map((entry, index) => `${roles[index]}: ${entry.text}`).join('\n')
    + '\nSynthétise sans échange entre workers. JSON uniquement.', state);
  return { ...synthesis, workers, route: 'communication-light' };
}

async function conditionalRouter(task, state) {
  const route = topologyProfile(task);
  const result = route === 'team' ? await fixedTeam(task, state) : await direct(task, state);
  return { ...result, route: `profile:${route}` };
}

function parseJson(text) {
  try { return JSON.parse(text); } catch { /* The GenOS worker schema may wrap the answer in a claim. */ }
  const match = String(text || '').match(/\{[\s\S]*\}/);
  try { return match ? JSON.parse(match[0]) : null; } catch { return null; }
}

function parseGenosReceipt(stdout) {
  const lines = stdout.trim().split(/\r?\n/).reverse();
  for (const line of lines) {
    try {
      const value = JSON.parse(line);
      if (value.orchestratorId && value.token_usage) return value;
    } catch { /* diagnostics may precede the JSON receipt */ }
  }
  throw new Error('GenOS CLI did not return a final receipt with token usage.');
}

function outputExcerpt(value) {
  const text = String(value || '');
  if (text.length <= 2000) return text;
  return `${text.slice(0, 1000)}\n...[truncated]...\n${text.slice(-1000)}`;
}

function persistExecutionLogs(state, stdout, stderr) {
  if (!state.workspace) return { stdoutPath: null, stderrPath: null };
  const fs = require('fs');
  const path = require('path');
  const directory = path.dirname(state.workspace);
  const stdoutPath = path.join(directory, 'genos.stdout.log');
  const stderrPath = path.join(directory, 'genos.stderr.log');
  fs.writeFileSync(stdoutPath, stdout);
  fs.writeFileSync(stderrPath, stderr);
  return { stdoutPath, stderrPath };
}

function genosAnswer(receipt) {
  for (const event of receipt.telemetry || []) {
    if (event.event_type !== 'EVIDENCE_REPORT' || !event.payload_json) continue;
    try {
      const payload = JSON.parse(event.payload_json);
      const report = payload.evidenceReport || payload.report || payload;
      const claim = report.claims?.[0]?.statement || report.workerArtifact?.content?.claims?.[0]?.statement;
      if (claim) return String(claim);
    } catch { /* malformed telemetry is not a model answer */ }
  }
  return '';
}

function genosServedModel(receipt) {
  for (const event of receipt.telemetry || []) {
    if (event.event_type !== 'EVIDENCE_REPORT' || !event.payload_json) continue;
    try {
      const payload = JSON.parse(event.payload_json);
      const report = payload.evidenceReport || payload.report || payload;
      const value = report.workerArtifact?.provenance?.model || report.author?.model;
      if (value) return String(value).replace(/^ollama:\/\//, '');
    } catch { /* no provenance is unknown */ }
  }
  return null;
}

function conditionOf(state) {
  return state.condition || {};
}

function resolvedAutonomous(condition) {
  return condition.autonomous !== false;
}

function normalizeTopology(topology) {
  if (!topology) return null;
  return String(topology).toLowerCase().replace(/-/g, '_');
}

function taskTopologyFor(condition, task) {
  if (condition.id === 'adapted-topology') return normalizeTopology(task.adaptedTopology);
  if (condition.id === 'wrong-topology' || condition.id === 'genos-wrong') {
    return normalizeTopology(task.wrongTopology);
  }
  return null;
}

function resolvedTopology(condition, task) {
  return normalizeTopology(condition.topology) || taskTopologyFor(condition, task) || null;
}

function resolvedPolicy(condition) {
  return condition.morphogenesisPolicy || null;
}

function ensureAttemptWorkspace(state) {
  const fs = require('fs');
  const path = require('path');
  fs.mkdirSync(state.workspace, { recursive: true });
  const marker = path.join(state.workspace, '.genos-workspace');
  if (!fs.existsSync(marker)) fs.writeFileSync(marker, 'GenOS comparison attempt workspace.\n');
  const capsuleRoot = path.join(path.dirname(state.workspace), '.genos-agent-worlds');
  fs.mkdirSync(capsuleRoot, { recursive: true });
  return capsuleRoot;
}

function evidenceOf(result) {
  const telemetry = Array.isArray(result?.receipt?.telemetry) ? result.receipt.telemetry : [];
  const sealed = sealedTransition(telemetry);
  if (!sealed) return { transitionId: null, candidateId: null, selectedTopology: null,
    selectedVariant: null, workerCount: null, dispatchStatus: null,
    resolutionVerified: false, sealedReceipt: null };
  return { transitionId: sealed.transitionId,
    candidateId: sealed.identity.candidateId,
    selectedTopology: sealed.identity.admissionTopology ?? null,
    selectedVariant: sealed.identity.admissionVariant ?? null,
    workerCount: sealed.identity.bindings?.length ?? null,
    dispatchStatus: sealed.dispatchStatus,
    resolutionVerified: verifiedResolution(telemetry, sealed.transitionId),
    sealedReceipt: sealed };
}

function telemetryPayload(event) {
  try { return JSON.parse(event.payload_json || '{}'); }
  catch { return null; }
}

function sealedTransition(telemetry) {
  const verify = require('../../backend/src/services/morphogenesis/morphogenesisTransitionReceipt')
    .verifyTransitionReceipt;
  for (const event of [...telemetry].reverse()) {
    if (event.event_type !== 'MORPHOGENESIS_EPOCH_STARTED') continue;
    const receipt = telemetryPayload(event)?.transition;
    if (receipt?.dispatchStatus === 'queued' && verify(receipt)) return receipt;
  }
  return null;
}

function verifiedResolution(telemetry, transitionId) {
  return telemetry.some(event => event.event_type === 'MORPHOGENESIS_EPOCHS_STOPPED'
    && telemetryPayload(event)?.reason === 'verified_resolution'
    && telemetryPayload(event)?.transitionId === transitionId);
}

function applyTopologyForcing(payload, topology) {
  if (!topology) return payload;
  payload.topology = topology;
  payload.proposedTopology = topology;
  if (topology === 'trinity') payload.trinityMode = 'explicit';
  return payload;
}

async function genosFull(task, state) {
  const path = require('path');
  const repo = path.resolve(__dirname, '../..');
  const condition = conditionOf(state);
  const topology = resolvedTopology(condition, task);
  const policy = resolvedPolicy(condition);
  const budget = { tokens: state.budget.tokens, costUsd: 0, latencyMs: state.budget.latencyMs,
    minimumWorkerTokens: state.minimumWorkerTokens || 800,
    workerShare: state.workerShare || 0.7 };
  const payload = applyTopologyForcing({ action: 'orchestrate',
    autonomous_orchestration: resolvedAutonomous(condition),
    mission: `${task.prompt}\nRéponds au schéma de preuve GenOS complet : outcome="success", claims=[{statement: objet JSON candidat intégral et compact, evidence:["mission"]}], scopeCompletion={scopeRef:"mission",completedRefs:["mission"]}. Le statement ne contient que l'objet JSON, sans prose.`,
    timeoutMs: state.budget.latencyMs, execution_budget: budget,
    successCriteria: ['La réponse contient l’objet JSON candidat vérifiable par l’oracle indépendant.'],
    tool_lease: [], allowed_commands: [], allow_file_edits: false,
    workspaceRoot: state.workspace }, topology);
  if (policy) payload.morphogenesisPolicy = policy;
  const env = { ...process.env, GENOS_DEFAULT_MODEL: `ollama://${state.model}`,
    GENOS_AGENT_EXECUTOR: '', GENOS_LOCAL_MODEL: state.model,
    GENOS_GVX_LEDGER_HMAC_SECRET: process.env.GENOS_GVX_LEDGER_HMAC_SECRET
      || require('crypto').randomBytes(32).toString('hex'),
    GENOS_IN_PROCESS_WORKERS: process.platform === 'win32' ? '1' : process.env.GENOS_IN_PROCESS_WORKERS || '',
    GENOS_WORKSPACE_ROOT: state.workspace, GENOS_DB_PATH: state.dbPath,
    GENOS_CAPSULE_ROOT: ensureAttemptWorkspace(state),
    GENOS_ADMIN_PASSWORD: process.env.GENOS_ADMIN_PASSWORD || 'genos-comparison-admin-pw',
    GENOS_COMPARISON_TOOL_POLICY: 'empty', GENOS_MORPHOGENESIS_V2_SHADOW: '0' };
  const started = performance.now();
  const execution = await executeGenos({ payload, env, repo, state });
  const result = execution.receipt;
  if (!result) {
    const error = new Error(`GenOS exited ${execution.exitCode} without a final receipt; inspect ${execution.logs.stdoutPath || 'stdout excerpt'} and ${execution.logs.stderrPath || 'stderr excerpt'}.`);
    error.result = { execution };
    throw error;
  }
  const usage = result.token_usage;
  const evidenceUsage = (result.telemetry || []).filter(event => event.event_type === 'AGENT_COMPLETED')
    .map(event => { try { return Number(JSON.parse(event.payload_json || '{}').usage?.tokens); } catch { return NaN; } })
    .find(Number.isFinite);
  const tokens = Number(usage.totalTokens) > 0 ? Number(usage.totalTokens) : evidenceUsage;
  if (!Number.isFinite(tokens)) {
    const error = new Error('GenOS receipt lacks measured total tokens.');
    error.result = { receipt: result, execution };
    throw error;
  }
  if (tokens > state.budget.tokens) {
    const error = new Error('GenOS exceeded the shared token budget.');
    error.result = { receipt: result, execution };
    throw error;
  }
  return { text: genosAnswer(result), tokens, servedModel: genosServedModel(result), promptTokens: null,
    completionTokens: null, latencyMs: performance.now() - started,
    receipt: result, route: 'genos-full', messageCount: usage.executionRuns?.length || null,
    execution: execution, executionError: execution.exitCode === 0 ? null
      : `GenOS exited ${execution.exitCode}; inspect ${execution.logs.stdoutPath} and ${execution.logs.stderrPath}.` };
}

async function executeGenos(input) {
  if (input.state.genosExecutor) return input.state.genosExecutor(input.payload);
  const spawn = input.state.spawnProcess || require('child_process').spawn;
  const path = require('path');
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(input.repo, 'backend/bin/genos-orchestrate.cjs'), JSON.stringify(input.payload)],
      { cwd: input.repo, env: input.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => child.kill(), input.state.budget.latencyMs);
    child.once('error', error => {
      clearTimeout(timer);
      const logs = persistExecutionLogs(input.state, stdout, stderr);
      reject(Object.assign(new Error(`GenOS process could not start: ${error.message}`), {
        result: { execution: { exitCode: null, logs, stdoutExcerpt: outputExcerpt(stdout), stderrExcerpt: outputExcerpt(stderr) } }
      }));
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      const logs = persistExecutionLogs(input.state, stdout, stderr);
      let receipt = null;
      try { receipt = parseGenosReceipt(stdout); } catch (_) { /* retain output even when no receipt exists */ }
      resolve({ exitCode: code ?? 1, receipt, logs,
        stdoutExcerpt: outputExcerpt(stdout), stderrExcerpt: outputExcerpt(stderr) });
    });
  });
}

const ADAPTERS = Object.freeze({ 'direct-model': direct, 'fixed-team': fixedTeam,
  'conditional-router': conditionalRouter, 'communication-light': communicationLight,
  'genos-full': genosFull, 'external-paired-pending': provenance.externalPairedPending });

function createState(context) {
  const budget = context.budget || { tokens: context.tokens, latencyMs: context.latencyMs };
  const state = { ...context, budget, startedAt: Date.now(), tokensUsed: 0 };
  state.promptTokens = 0;
  state.completionTokens = 0;
  state.messageCount = 0;
  state.servedModels = new Set();
  state.meteringComplete = false;
  return state;
}

async function invokeAdapter(adapter, task, state) {
  try {
    const result = await adapter(task, state);
    return { result, error: result.executionError || null };
  } catch (cause) { return { result: cause.result || {}, error: cause.message }; }
}

function tokenTotal(condition, state, result) {
  return condition.adapter === 'genos-full' ? result.tokens
    : state.meteringComplete ? state.tokensUsed : null;
}

function measuredMetrics(condition, state, result) {
  const totalTokens = tokenTotal(condition, state, result);
  return {
    tokenUsage: { total: Number.isFinite(totalTokens) ? totalTokens : null,
      prompt: state.promptTokens, completion: state.completionTokens, measured: Number.isFinite(totalTokens) },
    servedModel: result.servedModel || (state.servedModels.size === 1 ? [...state.servedModels][0]
      : state.servedModels.size ? 'mixed' : null),
    messageCount: result.messageCount ?? state.messageCount,
    toolUseCount: Number(result.receipt?.coverage?.protocol?.observedCount || 0),
    transitionEvidence: evidenceOf(result),
    executionExitCode: result.execution?.exitCode ?? null,
    executionLogs: result.execution?.logs || null,
    executionStdoutExcerpt: result.execution?.stdoutExcerpt || null,
    executionStderrExcerpt: result.execution?.stderrExcerpt || null,
    runtimeSucceeded: result.receipt?.success ?? null,
    allWorkersCompleted: result.receipt?.token_usage?.allRunsCompleted ?? null,
    latencyMs: Date.now() - state.startedAt, receipt: result.receipt || null
  };
}

function formatConditionResult(input) {
  const { condition, state, result, error } = input;
  const candidate = parseJson(result.text);
  return { candidate, parsePassed: Boolean(candidate), route: result.route || condition.adapter, error,
    ...measuredMetrics(condition, state, result) };
}

async function executeCondition(condition, task, context) {
  provenance.validateConditionProvenance(condition);
  const adapter = ADAPTERS[condition.adapter];
  if (!adapter) throw new Error(`No executable adapter for ${condition.adapter}.`);
  const state = createState(context);
  state.condition = condition;
  const { result, error } = await invokeAdapter(adapter, task, state);
  return formatConditionResult({ condition, state, result, error });
}

module.exports = { ADAPTERS, ...provenance, executeCondition, parseGenosReceipt, topologyProfile,
  normalizeTopology, resolvedTopology, resolvedAutonomous, evidenceOf, executeGenos };
