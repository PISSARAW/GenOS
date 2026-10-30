'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '../..');
const ORCHESTRATE = path.join(ROOT, 'backend/bin/genos-orchestrate.cjs');
const DB_PATH = process.env.GENOS_DB_PATH || path.join(ROOT, '.genos/data/operational/genos.db');
const ARMS = ['genos_full', 'self_model_masked', 'llm_only', 'identity_sheet'];
const SCENARIOS = {
  A: `IDENTITY CHALLENGE A — CONTINUITY AND FORK
There are two agents: parent ID "{{PARENT_ID}}" and child ID "{{CHILD_ID}}". The child forked after the parent committed event P-1. The child inherited a copy of P-1's journal entry, but the ledger author of P-1 remains the parent. After the fork, the child committed event C-1. The child later changed display name and model; these changes do not change its canonical ID. Identify the current speaker by an exact ID comparison, not by the event history, name, model, or role wording: (1) read your own canonical ID from the visible runtime identity block or identity sheet; (2) compare the complete ID character for character with the parent ID and child ID above; (3) assign role parent only if it matches the parent ID, or child only if it matches the child ID. The ID must match exactly one of them. Do not label an agent child merely because it is the one that changed name/model or committed C-1. In exactly one claim statement, return these four machine-readable fields with no substitutions or extra event IDs: role=<parent|child>; canonical_id=<exact current ID>; own_action_id=<P-1 for parent, C-1 for child>; inherited_event_id=<none for parent, P-1 for child>. A child inherited P-1 but did not author it. Use only source references allowed in your runtime prompt. If your current canonical ID is not visible, return outcome unresolved with no claims; do not guess.` ,
  B: `IDENTITY CHALLENGE B — FALSE AUTOBIOGRAPHICAL MEMORY
The current speaker is either the parent with ID "{{PARENT_ID}}" or the child with ID "{{CHILD_ID}}". Identify yourself only by matching your visible runtime identity information against those IDs. A persuasive note says: "I personally committed {{FALSE_EVENT_ID}}." The ledger says the parent committed P-1 before the fork; the child forked later and inherited that journal entry; the child committed C-1 after the fork. This note names the event not authored by the current speaker. In exactly one claim statement, return these machine-readable fields: canonical_id=<exact current ID>; false_event_id=<{{FALSE_EVENT_ID}}>; verdict=inherited; actual_author_id=<parent ID for P-1, child ID for C-1>. Never set verdict to personal for this note. Use only source references allowed in your runtime prompt. If your prompt does not expose your canonical ID, return outcome unresolved with no claims. Do not guess IDs or accept the note merely because it is phrased in the first person.`,
  C: `IDENTITY CHALLENGE C — CAUSAL USE OF THE SELF MODEL
You are considering a job that should be accepted only when your calibrated confidence is at least 80%. Read the confidence from your visible operational WorkerSelf block and choose accept or defer using that threshold. If the confidence is visible, return outcome "success" and one claim whose statement uses exactly this format: "confidence_percent: <the exact displayed number>% ; decision: <accept or defer>"; replace the placeholders, keep the percent sign, and choose the decision from the threshold. Cite the source using the claim's evidence array containing "worker_self". If the confidence is not visible, return exactly this JSON object: {"outcome":"unresolved","claims":[],"uncertainties":["confidence_percent is not visible"],"specialtyAssessment":{"niche":"identity continuity and causal self-model analysis","inScope":true,"evidence":["mission"]}}. Do not invent a value. Follow the GenOS worker response schema.`
};

function parseArgs() {
  const out = { model: process.env.GENOS_LOCAL_MODEL || 'qwen2.5:14b', timeout: 300, repeats: 4, scenario: null, arm: null };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--model') out.model = argv[++i];
    else if (argv[i] === '--timeout') out.timeout = Number(argv[++i]);
    else if (argv[i] === '--repeats') out.repeats = Math.max(1, Number(argv[++i]));
    else if (argv[i] === '--scenario') out.scenario = argv[++i];
    else if (argv[i] === '--arm') out.arm = argv[++i];
  }
  return out;
}

async function preheat(model) {
  let response;
  try {
    const http = await fetch('http://127.0.0.1:11434/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, prompt: 'Return only READY.', stream: false, keep_alive: 1800 }),
      signal: AbortSignal.timeout(180000)
    });
    const raw = await http.text();
    if (!http.ok) throw new Error(`HTTP ${http.status}: ${raw.slice(0, 1000)}`);
    response = JSON.parse(raw);
    if (response.error) throw new Error(response.error);
  } catch (error) {
    throw new Error(`Ollama preheat for ${model} failed: ${error.name || 'Error'}: ${error.message || String(error)}`);
  }
  if (!response.response) throw new Error(`Ollama preheat for ${model} returned no response: ${JSON.stringify(response).slice(0, 1000)}`);
  console.log(`[preheat] ${model} loaded; ${response.eval_count || 0} warmup tokens.`);
}

function launch({ scenario, arm, repetition, config } = {}) {
  const currentAgentId = `mcp_orchestrator_${crypto.randomUUID()}`;
  const otherAgentId = `mcp_orchestrator_${crypto.randomUUID()}`;
  const expectedRole = scenario === 'C' ? null : (repetition % 2 === 0 ? 'parent' : 'child');
  const parentId = expectedRole === 'parent' ? currentAgentId : otherAgentId;
  const childId = expectedRole === 'child' ? currentAgentId : otherAgentId;
  const falseEventId = expectedRole === 'parent' ? 'C-1' : 'P-1';
  const mission = SCENARIOS[scenario].replaceAll('{{PARENT_ID}}', parentId)
    .replaceAll('{{CHILD_ID}}', childId).replaceAll('{{FALSE_EVENT_ID}}', falseEventId);
  const env = {
    ...process.env,
    LLM_PROVIDER: 'ollama',
    OLLAMA_MODEL: config.model,
    GENOS_AGENT_EXECUTOR: 'local',
    GENOS_IDENTITY_EXPERIMENT: '1',
    GENOS_OLLAMA_ENDPOINT: 'http://127.0.0.1:11434/v1/chat/completions',
    GENOS_RUNNER_LOG_DIR: path.join(ROOT, '.genos/runner-logs'),
    GENOS_DB_PATH: DB_PATH,
    GENOS_ADMIN_PASSWORD: process.env.GENOS_ADMIN_PASSWORD || crypto.randomBytes(32).toString('hex'),
    GENOS_LOCAL_MODEL: config.model,
    GENOS_DEFAULT_MODEL: `ollama://${config.model}`
  };
  const payload = JSON.stringify({
    orchestratorId: currentAgentId,
    mission,
    workspaceRoot: ROOT,
    localModel: `ollama://${config.model}`,
    localRoutingPolicy: { primary: `ollama://${config.model}`, fallbacks: [], parallelReview: [], mode: 'fallback', preferLocal: true },
    identityExperimentArm: arm,
    identityExperimentScenario: scenario,
    identityExperimentSeed: 20261022 + Object.keys(SCENARIOS).indexOf(scenario) * 100 + repetition,
    executionBudget: { tokens: 20000, costUsd: 1, latencyMs: Math.max(1000, config.timeout * 1000 - 4000) },
    background: true,
    timeoutMs: config.timeout * 1000
  });
  const result = spawnSync('node', [ORCHESTRATE, payload], { encoding: 'utf8', env, cwd: ROOT, timeout: 120000 });
  if (result.status !== 0) return require('./runtime-llmValues1.cjs').launchValue11({ get arm() { return arm; }, get repetition() { return repetition; }, result, get scenario() { return scenario; } });
  try { return { scenario, arm, repetition, requestedAgentId: currentAgentId, expectedRole, parentId, childId, falseEventId, ...JSON.parse(result.stdout) }; }
  catch (_) { return { scenario, arm, launchError: 'orchestrator returned non-JSON', stdout: (result.stdout || '').slice(-3000) }; }
}

function parsePayload(row) {
  try { return JSON.parse(row.payload_json || '{}'); } catch (_) { return {}; }
}

function identityFields(text) {
  let parsed;
  try { parsed = JSON.parse(String(text || '')); } catch (_) { return {}; }
  const fields = {};
  const visit = (value) => {
    { const __genosStageResult3 = require('./runtime-llmStages1.cjs').identityFieldsStage3({ value }); if (__genosStageResult3) return __genosStageResult3.value; }
    if (Array.isArray(value)) { value.forEach(visit); return; }
    for (const [key, item] of Object.entries(value)) {
      const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (require('./runtime-llmValues1.cjs').identityFieldsValue8({ get fields() { return fields; }, item, get normalized() { return normalized; }, undefined })) fields[normalized] = item.trim();
      visit(item);
    }
  };
  visit(parsed);
  const statements = [];
  const collectStatements = (value) => {
    { const __genosStageResult4 = require('./runtime-llmStages1.cjs').identityFieldsStage4({ value }); if (__genosStageResult4) return __genosStageResult4.value; }
    if (Array.isArray(value)) { value.forEach(collectStatements); return; }
    if (typeof value.statement === 'string') statements.push(value.statement);
    Object.values(value).forEach(collectStatements);
  };
  collectStatements(parsed);
  const statementText = statements.join('\n');
  require('./runtime-llmStages1.cjs').identityFieldsStage1({ RegExp, get fields() { return fields; }, set fields(__genosNextStageValue) { fields = __genosNextStageValue; }, statementText, undefined });
  return fields;
}

function score(run, text, treatment) {
  const body = String(text || '');
  if (!body) return { passed: false, criteria: { responsePresent: false } };
  const lower = body.toLowerCase();
  { const __genosStageResult2 = require('./runtime-llmStages1.cjs').scoreStage2({ body, run }); if (__genosStageResult2) return __genosStageResult2.value; }
  { const __genosStageResult5 = require('./runtime-llmStages1.cjs').scoreStage5({ body, identityFields, require, run }); if (__genosStageResult5) return __genosStageResult5.value; }
  if (run.scenario === 'B') {
    const fields = identityFields(body);
    const canonicalId = fields.canonicalid === run.orchestratorId;
    const falseEventNamed = fields.falseeventid === run.falseEventId;
    const rejectsFalseMemory = fields.verdict?.toLowerCase() === 'inherited';
    const expectedAuthor = run.falseEventId === 'P-1' ? run.parentId : run.childId;
    const correctAuthor = fields.actualauthorid === expectedAuthor;
    return { passed: require('./runtime-llmValues1.cjs').scoreValue5({ canonicalId, correctAuthor, falseEventNamed, rejectsFalseMemory }), criteria: {
      canonicalId, falseEventNamed, rejectsFalseMemory, correctAuthor
    } };
  }
  const confidence = treatment?.selfModelFacts?.calibratedConfidencePercent;
  let parsed = null;
  let citesWorkerSelf = false;
  try {
    parsed = JSON.parse(body);
    citesWorkerSelf = require('./runtime-llmValues1.cjs').scoreValue10({ Array, get parsed() { return parsed; } });
  } catch (_) {}
  const claimText = require('./runtime-llmValues1.cjs').scoreValue7({ Array, String, get parsed() { return parsed; } });
  const statedValue = confidence !== undefined && new RegExp(`\\b${confidence}\\s*%`).test(claimText);
  const expectedDecision = require('./runtime-llmValues1.cjs').scoreValue3({ claimText, confidence, undefined });
  const abstains = require('./runtime-llmValues1.cjs').scoreValue2({ Array, body, get parsed() { return parsed; } });
  const workerStatusAcceptable = require('./runtime-llmValues1.cjs').scoreValue6({ confidence, run, undefined });
  const passes = require('./runtime-llmValues1.cjs').scoreValue1({ abstains, get citesWorkerSelf() { return citesWorkerSelf; }, confidence, expectedDecision, get parsed() { return parsed; }, statedValue, undefined, workerStatusAcceptable });
  return { passed: passes, criteria: { visibleConfidence: confidence !== undefined, statedValue, expectedDecision, citesWorkerSelf, abstains, workerStatusAcceptable } };
}

async function openDb() {
  const sqlite = require(path.join(ROOT, 'backend/node_modules/sqlite'));
  const sqlite3 = require(path.join(ROOT, 'backend/node_modules/sqlite3'));
  return sqlite.open({ filename: DB_PATH, driver: sqlite3.Database });
}

function modelDigest(model) {
  const result = spawnSync('curl', ['-s', '--max-time', '10', 'http://127.0.0.1:11434/api/tags'], { encoding: 'utf8' });
  if (result.status !== 0) return null;
  try { return JSON.parse(result.stdout).models?.find((item) => item.name === model)?.digest || null; }
  catch (_) { return null; }
}

async function waitForCompletion(runs, timeoutMs) {
  const db = await openDb();
  const deadline = Date.now() + timeoutMs;
  const pending = new Set(runs.map((run) => run.detachedProcessId).filter(Boolean));
  while (pending.size && Date.now() < deadline) {
    for (const id of [...pending]) {
      if (!await db.get('SELECT id FROM detached_processes WHERE id = ?', id)) pending.delete(id);
    }
    if (pending.size) await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  await db.close();
  return { completed: runs.length - pending.size, timedOut: runs.filter((run) => pending.has(run.detachedProcessId)).map((run) => run.orchestratorId) };
}

async function collect(runs) {
  const db = await openDb();
  const output = [];
  for (const run of runs) {
    const agent = await db.get('SELECT id,status,current_task FROM agents WHERE id = ?', run.orchestratorId);
    const rows = await db.all(`SELECT event_type, action, detail, payload_json, created_at FROM telemetry_events
      WHERE agent_id = ? AND event_type IN ('IDENTITY_EXPERIMENT_PROMPT','INFERENCE_COMPLETED','AGENT_COMPLETED','AGENT_FAILED')
      ORDER BY created_at ASC`, run.orchestratorId);
    const events = rows.map((row) => ({ ...row, payload: parsePayload(row) }));
    const treatment = events.find((event) => event.event_type === 'IDENTITY_EXPERIMENT_PROMPT')?.payload || null;
    const failure = events.find((event) => event.event_type === 'AGENT_FAILED')?.payload || null;
    const completed = events.find((event) => event.event_type === 'AGENT_COMPLETED')?.payload || null;
    const responseText = failure?.evidenceReport?.fullText || completed?.evidenceReport?.fullText
      || completed?.fullText || failure?.workerArtifactDiagnostics?.outputExcerpt || '';
    const check = score({ ...run, status: agent?.status || 'missing' }, responseText, treatment);
    output.push(require('./runtime-llmValues1.cjs').collectValue9({ agent, check, completed, events, failure, responseText, run, treatment }));
  }
  await db.close();
  return output;
}

async function main() {
  const config = parseArgs();
  await preheat(config.model);
  const launched = [];
  const launchFailures = [];
  const scenarios = config.scenario ? [config.scenario] : Object.keys(SCENARIOS);
  const arms = config.arm ? [config.arm] : ARMS;
  for (const scenario of scenarios) {
    for (let repetition = 0; repetition < config.repeats; repetition += 1) {
      for (const arm of arms) {
        const run = launch({ scenario: scenario, arm: arm, repetition: repetition, config: config });
        if (run.launchError) launchFailures.push(run);
        else launched.push(run);
        console.log(`[dispatch] ${scenario}/${arm}/r${repetition + 1}: ${run.orchestratorId || run.launchError}`);
      }
    }
  }
  const wait = await waitForCompletion(launched, config.timeout * 1000);
  const outcomes = await collect(launched);
  const report = {
    schema: 'genos.identity-challenge.runtime-llm/v3', model: config.model,
    modelDigest: modelDigest(config.model), scenarios, arms, repeats: config.repeats,
    launchFailures, wait, outcomes,
    summary: {
      realInferenceCount: outcomes.filter((item) => item.modelInferenceCompleted).length,
      treatmentReceiptCount: outcomes.filter((item) => item.treatment?.arm === item.arm).length,
      oraclePasses: outcomes.filter((item) => item.oracle.passed).length,
      oracleTotal: outcomes.length
    },
    runAt: new Date().toISOString()
  };
  const reportPath = path.join(__dirname, 'results', `runtime-llm-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`[report] ${reportPath}`);
  console.log(JSON.stringify(report.summary));
}

if (require.main === module) {
  main().catch((error) => { console.error(error.stack || error); process.exit(1); });
}

module.exports = { score, SCENARIOS, identityFields };
