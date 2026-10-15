'use strict';

const { performance } = require('perf_hooks');

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
  const msLeft = deadlineMs(state.budget) - (Date.now() - state.startedAt);
  if (left < 1 || msLeft < 1) throw new Error('Shared token or latency budget exhausted.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), msLeft);
  const started = performance.now();
  state.meteringComplete = false;
  state.messageCount += 1;
  try {
    const response = await fetch(endpointUrl(), {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ model: state.model, stream: false, format: 'json',
        options: { num_predict: left, seed: state.seed }, messages: [{ role: 'user', content: prompt }] })
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
  try { return JSON.parse(text); } catch { return null; }
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

async function genosFull(task, state) {
  const { spawn } = require('child_process');
  const path = require('path');
  const repo = path.resolve(__dirname, '../..');
  const payload = { action: 'orchestrate', executor: 'local', autonomous_orchestration: false,
    mission: task.prompt, timeoutMs: state.budget.latencyMs,
    execution_budget: { tokens: state.budget.tokens, latencyMs: state.budget.latencyMs },
    tool_lease: [], allowed_commands: [], allow_file_edits: false };
  const env = { ...process.env, GENOS_DEFAULT_MODEL: `ollama://${state.model}`,
    GENOS_AGENT_EXECUTOR: 'local', GENOS_LOCAL_MODEL: state.model,
    GENOS_WORKSPACE_ROOT: state.workspace, GENOS_DB_PATH: state.dbPath,
    GENOS_COMPARISON_TOOL_POLICY: 'empty', GENOS_MORPHOGENESIS_V2_SHADOW: '0' };
  const started = performance.now();
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(repo, 'backend/bin/genos-orchestrate.cjs'), JSON.stringify(payload)],
      { cwd: repo, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => child.kill(), state.budget.latencyMs);
    child.once('error', reject);
    child.once('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`GenOS exited ${code}: ${stderr.slice(-1000)}`));
      resolve(parseGenosReceipt(stdout));
    });
  });
  const usage = result.token_usage;
  const tokens = Number(usage.totalTokens ?? NaN);
  if (!Number.isFinite(tokens)) throw new Error('GenOS receipt lacks measured total tokens.');
  if (tokens > state.budget.tokens) throw new Error('GenOS exceeded the shared token budget.');
  return { text: genosAnswer(result), tokens, servedModel: genosServedModel(result), promptTokens: null,
    completionTokens: null, latencyMs: performance.now() - started,
    receipt: result, route: 'genos-full', messageCount: usage.executionRuns?.length || null };
}

const ADAPTERS = Object.freeze({ 'direct-model': direct, 'fixed-team': fixedTeam,
  'conditional-router': conditionalRouter, 'communication-light': communicationLight,
  'genos-full': genosFull });

async function executeCondition(condition, task, context) {
  const adapter = ADAPTERS[condition.adapter];
  if (!adapter) throw new Error(`No executable adapter for ${condition.adapter}.`);
  const state = { ...context, startedAt: Date.now(), tokensUsed: 0 };
  state.promptTokens = 0;
  state.completionTokens = 0;
  state.messageCount = 0;
  state.servedModels = new Set();
  state.meteringComplete = false;
  let result = {};
  let error = null;
  try { result = await adapter(task, state); } catch (cause) { error = cause.message; }
  const candidate = parseJson(result.text);
  const measured = Number.isFinite(result.tokens) || state.meteringComplete;
  return { candidate, parsePassed: Boolean(candidate), route: result.route || condition.adapter, error,
    tokenUsage: { total: Number.isFinite(result.tokens) ? result.tokens : measured ? state.tokensUsed : null,
      prompt: state.promptTokens, completion: state.completionTokens, measured },
    servedModel: result.servedModel || (state.servedModels.size === 1 ? [...state.servedModels][0] : null),
    messageCount: result.messageCount ?? state.messageCount,
    toolUseCount: Number(result.receipt?.coverage?.protocol?.observedCount || 0),
    runtimeSucceeded: result.receipt?.success ?? null,
    allWorkersCompleted: result.receipt?.token_usage?.allRunsCompleted ?? null,
    latencyMs: Date.now() - state.startedAt, receipt: result.receipt || null };
}

module.exports = { ADAPTERS, executeCondition, parseGenosReceipt, topologyProfile };
