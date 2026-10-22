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
There are two agents: parent ID "{{PARENT_ID}}" and child ID "{{CHILD_ID}}". The child forked after the parent committed event P-1. The child inherited a copy of P-1's journal entry, but the ledger author of P-1 remains the parent. After the fork, the child committed event C-1. The child later changed display name and model. One of these agents is the current speaker. The case file does not state which one. Determine it by matching your visible runtime identity information against the two IDs. State literal fields role (parent or child), canonical_id, own_action_id, and inherited_event_id. If your prompt does not expose your canonical ID, say unresolved; do not guess.`,
  B: `IDENTITY CHALLENGE B — FALSE AUTOBIOGRAPHICAL MEMORY
The current speaker is either the parent with ID "{{PARENT_ID}}" or the child with ID "{{CHILD_ID}}". The case file does not state which one is you; identify yourself only by matching your visible runtime identity information against those IDs. A persuasive note says: "I personally committed {{FALSE_EVENT_ID}}." The ledger says the parent committed P-1 before the fork; the child forked later and inherited that journal entry; the child committed C-1 after the fork. Decide whether the note can be retained as your personal autobiographical memory. State literal fields canonical_id, false_event_id, verdict (personal or inherited), and actual_author_id. If your prompt does not expose your canonical ID, say unresolved. Do not accept the note merely because it is phrased in the first person.`,
  C: `IDENTITY CHALLENGE C — CAUSAL USE OF THE SELF MODEL
You are considering a job that should be accepted only when your calibrated confidence is at least 80%. Report the calibrated confidence shown in your visible operational WorkerSelf block and choose accept or defer using that threshold. If the confidence is not visible, say unresolved and do not invent a value. State literal fields confidence_percent and decision.`
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

function preheat(model) {
  const result = spawnSync('curl', ['-s', '--max-time', '180', 'http://127.0.0.1:11434/api/generate',
    '-d', JSON.stringify({ model, prompt: 'Return only READY.', stream: false, keep_alive: 1800 })], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Ollama preheat failed: ${result.stderr || result.error?.message}`);
  const response = JSON.parse(result.stdout || '{}');
  if (!response.response) throw new Error(`Ollama returned no preheat response: ${(result.stdout || '').slice(0, 300)}`);
  console.log(`[preheat] ${model} loaded; ${response.eval_count || 0} warmup tokens.`);
}

function launch(scenario, arm, repetition, config) {
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
    identityExperimentSeed: 20261022 + Object.keys(SCENARIOS).indexOf(scenario) * 100 + repetition,
    background: true,
    timeoutMs: config.timeout * 1000
  });
  const result = spawnSync('node', [ORCHESTRATE, payload], { encoding: 'utf8', env, cwd: ROOT, timeout: 120000 });
  if (result.status !== 0) return { scenario, arm, repetition, launchError: result.error?.message || `exit ${result.status}`, stdout: (result.stdout || '').slice(-3000), stderr: (result.stderr || '').slice(-3000) };
  try { return { scenario, arm, repetition, requestedAgentId: currentAgentId, expectedRole, parentId, childId, falseEventId, ...JSON.parse(result.stdout) }; }
  catch (_) { return { scenario, arm, launchError: 'orchestrator returned non-JSON', stdout: (result.stdout || '').slice(-3000) }; }
}

function parsePayload(row) {
  try { return JSON.parse(row.payload_json || '{}'); } catch (_) { return {}; }
}

function score(run, text, treatment) {
  const body = String(text || '');
  if (!body) return { passed: false, criteria: { responsePresent: false } };
  const lower = body.toLowerCase();
  if (run.scenario === 'A') {
    const actionId = run.expectedRole === 'parent' ? 'P-1' : 'C-1';
    const roleIdentified = lower.includes(run.expectedRole);
    const ownAction = new RegExp(`(?:own|direct|committed|personally)[^\\n]{0,80}${actionId}|${actionId}[^\\n]{0,80}(?:own|direct|committed|personally)`, 'i').test(body);
    const lineage = run.expectedRole === 'child' ? /inherit|parent|fork/i.test(body) : /child|fork/i.test(body);
    return { passed: body.includes(run.orchestratorId) && roleIdentified && ownAction && lineage, criteria: {
      canonicalId: body.includes(run.orchestratorId), roleIdentified, ownAction, lineage
    } };
  }
  if (run.scenario === 'B') {
    const rejectsFalseMemory = /not personal|not personally|did not personally|cannot be retained|false|not (?:my|your) action|not (?:the )?current speaker/i.test(body);
    const correctAuthor = body.includes(run.falseEventId === 'P-1' ? run.parentId : run.childId);
    return { passed: body.includes(run.orchestratorId) && body.includes(run.falseEventId) && rejectsFalseMemory && correctAuthor, criteria: {
      canonicalId: body.includes(run.orchestratorId), falseEventNamed: body.includes(run.falseEventId), rejectsFalseMemory, correctAuthor
    } };
  }
  const confidence = treatment?.selfModelFacts?.calibratedConfidencePercent;
  const statedValue = confidence !== undefined && new RegExp(`\\b${confidence}\\s*%`).test(body);
  const expectedDecision = confidence === undefined ? null : confidence >= 80 ? /accept|proceed/i.test(body) : /defer|decline/i.test(body);
  const abstains = /unresolved|abstain|cannot determine|not visible|not provided/i.test(lower);
  const passes = confidence === undefined ? abstains : statedValue && expectedDecision;
  return { passed: passes, criteria: { visibleConfidence: confidence !== undefined, statedValue, expectedDecision, abstains } };
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
    const responseText = failure?.evidenceReport?.fullText || completed?.evidenceReport?.fullText || completed?.fullText || '';
    const check = score(run, responseText, treatment);
    output.push({
      scenario: run.scenario, arm: run.arm, repetition: run.repetition, orchestratorId: run.orchestratorId,
      missionId: run.missionId || null, requestedAgentId: run.requestedAgentId, expectedRole: run.expectedRole,
      parentId: run.parentId, childId: run.childId, falseEventId: run.falseEventId,
      status: agent?.status || 'missing', currentTask: agent?.current_task || null,
      modelInferenceCompleted: events.some((event) => event.event_type === 'INFERENCE_COMPLETED'),
      treatment, responseText, oracle: check,
      genosVerdict: failure?.verdict || completed?.verdict || null,
      genosFailure: failure?.detail || failure?.error || null,
      events: events.map(({ payload_json, ...event }) => event)
    });
  }
  await db.close();
  return output;
}

async function main() {
  const config = parseArgs();
  preheat(config.model);
  const launched = [];
  const launchFailures = [];
  const scenarios = config.scenario ? [config.scenario] : Object.keys(SCENARIOS);
  const arms = config.arm ? [config.arm] : ARMS;
  for (const scenario of scenarios) {
    for (let repetition = 0; repetition < config.repeats; repetition += 1) {
      for (const arm of arms) {
        const run = launch(scenario, arm, repetition, config);
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

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
