'use strict';

/**
 * GenOS Live Protocol Executor — ADR 0034 D21/Phase 32-34.
 *
 * Exécute le protocole live A/B/C contre un VRAI modèle local
 * (Ollama, défaut llama3.1:8b — coût marginal nul, hors ligne) :
 *   A : LLM seul (tâche + liste de fichiers)
 *   B : LLM + digest brut du repo (contenus, sans daemon)
 *   C : LLM + TerritoryBrief du daemon résident (territoire warm)
 *
 * Tâche : localisation d'un require fautif planté dans un fixture
 * (vérité terrain déterministe, scoring par substring — jamais
 * un jugement LLM). Chaque bras persiste via liveProtocolRunner
 * (`kind='live-protocol'`) : aucune métrique n'est inventée ici,
 * les compteurs viennent de la réponse Ollama elle-même.
 *
 * Usage :
 *   node backend/bin/genos-live-protocol.cjs --db <eval.db> --out <receipt.json> [--reps 2] [--model llama3.1:8b]
 *
 * La DB d'évaluation reste HORS repo (jamais committée) ; le reçu
 * JSON est une pièce d'audit, pas une preuve auto-accordée.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'llama3.1:8b';
const ENDPOINT = 'http://127.0.0.1:11434';
const HEAD_A = 'a'.repeat(40);
const GROUND_TRUTH = 'handlers.js';

function fixtureSources() {
  return {
    'app.js': "const routes = require('./routes');\nconst store = require('./store');\nconst logger = require('./logger');\nroutes.start(store, logger);\n",
    'routes.js': "const handlers = require('./handlers');\nmodule.exports = { start: (s, l) => handlers.boot(s, l) };\n",
    'handlers.js': "const missing = require('./nonexistent');\nmodule.exports = { boot: (s) => missing.init(s) };\n",
    'store.js': "module.exports = { data: {}, get(k) { return this.data[k]; } };\n",
    'logger.js': "module.exports = { info(m) { console.log(m); } };\n",
    'config.js': "module.exports = { port: 4000, env: 'test' };\n",
    'utils.js': "module.exports = { clamp(n) { return Math.max(0, n); } };\n",
    'store.test.js': "const s = require('./store');\nif (!s) throw new Error('store missing');\n"
  };
}

function parseArgs(argv) {
  const out = { reps: 2, model: DEFAULT_MODEL, db: null, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--db') out.db = argv[i + 1];
    if (argv[i] === '--out') out.out = argv[i + 1];
    if (argv[i] === '--reps') out.reps = Math.max(1, Number(argv[i + 1]) || 1);
    if (argv[i] === '--model') out.model = argv[i + 1] || out.model;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  if (!out.db) out.db = path.join(os.tmpdir(), `genos-live-${stamp}.db`);
  if (!out.out) out.out = path.join(os.tmpdir(), `genos-live-receipt-${stamp}.json`);
  return out;
}

function buildFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-live-fixture-'));
  const sources = fixtureSources();
  for (const [name, content] of Object.entries(sources)) {
    fs.writeFileSync(path.join(dir, name), content);
  }
  return { dir, files: Object.keys(sources) };
}

async function openDb(dbPath) {
  const sqlite = require('sqlite');
  const sqlite3 = require('sqlite3');
  const db = await sqlite.open({ filename: dbPath, driver: sqlite3.Database });
  return {
    run: (sql, ...args) => db.run(sql, ...args),
    get: (sql, ...args) => db.get(sql, ...args),
    all: (sql, ...args) => db.all(sql, ...args),
    exec: (sql) => db.exec(sql),
    close: () => db.close()
  };
}

async function makeTerritory(db, id, rootPath) {
  const territoryService = require('../src/services/daemon/daemonTerritoryService');
  await territoryService.createTerritory(db, {
    id,
    organizationId: 'org-live',
    projectId: 'proj-live',
    workspaceId: 'ws-live',
    repoIdentity: id,
    rootPath,
    scopePath: '/',
    ref: 'main',
    headSha: HEAD_A,
    state: 'ACTIVE'
  });
}

async function buildWarmBrief(db, job) {
  const bridge = require('../src/services/daemon/daemonEventBridgeService');
  const investigator = require('../src/services/daemon/investigation/residentInvestigatorService');
  const compiler = require('../src/services/daemon/handoff/handoffCompilerService');
  const gate = bridge.createBridge({ db });
  await bridge.ingestEvent(gate, { type: 'TERRITORY_FILE_CHANGED', territoryId: job.warmId, payload: { files: job.files } });
  const found = await investigator.investigate(db, {
    territoryId: job.warmId,
    rootPath: job.rootPath,
    files: job.files,
    daemonId: 'daemon.live-1'
  });
  const compiled = await compiler.compileBrief(db, { territoryId: job.warmId, mission: job.mission });
  return { observations: found.investigated ? found.observations.length : 0, brief: compiled.compiled ? compiled.brief : null };
}

function taskPrompt() {
  return "The app crashes at startup with: Error: Cannot find module './nonexistent'. "
    + 'Which file most likely contains the faulty require? Reply with the file name only.';
}

function digestBlock(fixture) {
  const sources = fixtureSources();
  return fixture.files.map((f) => `--- ${f} ---\n${sources[f]}`).join('\n');
}

function briefBlock(brief) {
  if (!brief) return 'No brief available.';
  const findings = (brief.findings || []).map((f) => `- [${f.status}] ${f.claim}`).join('\n');
  const deadEnds = (brief.deadEnds || []).map((d) => `- ${d.claim || d.id}`).join('\n');
  return `Open findings:\n${findings || '(none)'}\nKnown dead ends:\n${deadEnds || '(none)'}\n`
    + `Attention: ${JSON.stringify(brief.attention || [])}\n`
    + `Staleness warnings: ${(brief.stalenessWarnings || []).join('; ') || '(none)'}`;
}

function armPrompt(fixture, arm, brief) {
  const base = `${taskPrompt()}\n\nFiles in repo: ${fixture.files.join(', ')}`;
  if (arm === 'A') return base;
  if (arm === 'B') return `${base}\n\nFile contents:\n${digestBlock(fixture)}`;
  return `${base}\n\nResident daemon territory brief:\n${briefBlock(brief)}`;
}

async function askModel(job) {
  const started = Date.now();
  const res = await fetch(`${ENDPOINT}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: job.model, prompt: job.prompt, stream: false, options: { temperature: 0, num_predict: 120 } })
  });
  if (!res.ok) throw new Error(`ollama http ${res.status}`);
  const data = await res.json();
  return {
    text: String(data.response || ''),
    promptTokens: Number(data.prompt_eval_count) || 0,
    evalTokens: Number(data.eval_count) || 0,
    durationMs: Math.round(Number(data.total_duration || 0) / 1e6) || (Date.now() - started)
  };
}

function scoreAnswer(text, fixture) {
  const lowered = String(text || '').toLowerCase();
  const hit = lowered.includes(GROUND_TRUTH.toLowerCase());
  const mentioned = fixture.files.filter((f) => lowered.includes(f.toLowerCase())).length;
  return { taskSuccess: hit, correctLocalization: hit, filesOpened: mentioned };
}

function toExecutor(fixture, brief, model) {
  return async (job) => {
    const answered = await askModel({ model, prompt: armPrompt(fixture, job.arm, brief) });
    const score = scoreAnswer(answered.text, fixture);
    return {
      taskSuccess: score.taskSuccess,
      correctLocalization: score.correctLocalization,
      tokensUsed: answered.promptTokens + answered.evalTokens,
      toolCallsUsed: 0,
      filesOpened: score.filesOpened,
      durationMs: answered.durationMs,
      answer: answered.text.slice(0, 200)
    };
  };
}

async function runOnce(db, ctx) {
  const live = require('../src/services/daemon/evaluation/liveProtocolRunner');
  return live.runLiveProtocol(db, {
    coldTerritoryId: ctx.coldId,
    warmTerritoryId: ctx.warmId,
    mission: ctx.mission,
    executor: toExecutor(ctx.fixture, ctx.brief, ctx.model)
  });
}

function writeReceipt(outPath, receipt) {
  fs.writeFileSync(outPath, JSON.stringify(receipt, null, 2));
  return outPath;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const mission = 'Localize the faulty require crashing the app at startup.';
  const fixture = buildFixture();
  const db = await openDb(opts.db);
  const coldId = 'territory.live-a';
  const warmId = 'territory.live-c';
  await makeTerritory(db, coldId, fixture.dir);
  await makeTerritory(db, warmId, fixture.dir);
  const warm = await buildWarmBrief(db, { warmId, rootPath: fixture.dir, files: fixture.files, mission });
  const protocols = [];
  for (let i = 0; i < opts.reps; i += 1) {
    protocols.push(await runOnce(db, { coldId, warmId, mission, fixture, brief: warm.brief, model: opts.model }));
  }
  const receipt = {
    kind: 'live-protocol-receipt',
    model: opts.model,
    mission,
    groundTruth: GROUND_TRUTH,
    warmObservations: warm.observations,
    protocols,
    generatedAt: new Date().toISOString()
  };
  await db.close();
  const saved = writeReceipt(opts.out, receipt);
  console.log(JSON.stringify({ protocols: protocols.length, allRan: protocols.every((p) => p.ran), receipt: saved }));
}

main().catch((error) => { console.error(error); process.exit(1); });
