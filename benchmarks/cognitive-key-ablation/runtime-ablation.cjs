'use strict';

/**
 * Cognitive Key System — runner runtime du benchmark d'ablation (point 7,
 * mesure de sortie). Exécute de VRAIES missions via genos-orchestrate.cjs
 * avec le modèle local Ollama, bras A (sans phénotype) vs bras E (avec
 * GENOS_COGNITIVE_PHENOTYPE=1), puis mesure la qualité des dossiers
 * d'évidence produits par chaque bras.
 *
 * Contrôles expérimentaux :
 *  - mêmes missions (texte identique) pour A et E ;
 *  - même modèle (OLLAMA_MODEL), même budget, même exécuteur ;
 *  - seule différence : le flag cognitif (et la composition de portfolio
 *    qu'il déclenche à l'attachement du plan) ;
 *  - ordre alterné A/E pour neutraliser la dérive thermique du modèle
 *    (chauffe, cache) entre bras.
 *
 * Mesure de sortie (par mission, depuis la DB) :
 *  - dossiers d'évidence des workers : claims, tests, uncertainties ;
 *  - score structurel = claims + 2×tests + 0.5×uncertainties (même
 *    signal que le registre 036) ;
 *  - registre cognitive_recipe_performance (bras E uniquement).
 *
 * Usage :
 *   node benchmarks/cognitive-key-ablation/runtime-ablation.cjs \
 *     [--model qwen2.5:14b] [--missions 2] [--timeout 240]
 */

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '../..');
const ORCHESTRATE = path.join(ROOT, 'backend/bin/genos-orchestrate.cjs');
const DB_PATH = path.join(ROOT, 'backend/genos.db');

const MISSIONS = [
  'Diagnose why a distributed cache serves stale reads after failover. The causal uncertainty persists: separate observed regularity from cause, propose the most likely cause, and list the tests that would verify or refute each claim.',
  'Evaluate whether the observed throughput collapse under load is real emergence from component interactions or merely labeling. Run isolation reasoning: what disappears when components are isolated, and which tests distinguish emergence from aggregation?'
];

function args() {
  const parsed = { model: 'qwen2.5:14b', missions: 2, timeout: 240 };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 2) {
    if (argv[i] === '--model') parsed.model = argv[i + 1];
    if (argv[i] === '--missions') parsed.missions = Number(argv[i + 1]);
    if (argv[i] === '--timeout') parsed.timeout = Number(argv[i + 1]);
  }
  return parsed;
}

function preheat(model) {
  console.log(`[preheat] chargement de ${model} en VRAM...`);
  const result = spawnSync('curl', ['-s', '--max-time', '180', 'http://127.0.0.1:11434/api/generate',
    '-d', JSON.stringify({ model, prompt: 'OK', stream: false, keep_alive: 1800 })],
    { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error('[preheat] ÉCHEC — Ollama injoignable ou modèle absent.');
    process.exit(1);
  }
  console.log('[preheat] modèle chaud.');
}

function runMission(mission, arm, config) {
  const env = {
    ...process.env,
    LLM_PROVIDER: 'ollama',
    OLLAMA_MODEL: config.model,
    GENOS_AGENT_EXECUTOR: 'local',
    GENOS_OLLAMA_ENDPOINT: 'http://127.0.0.1:11434/v1/chat/completions',
    GENOS_RUNNER_LOG_DIR: path.join(ROOT, '.genos/runner-logs')
  };
  if (arm === 'E') env.GENOS_COGNITIVE_PHENOTYPE = '1';
  const payload = JSON.stringify({
    mission,
    background: true,
    timeoutMs: config.timeout * 1000
  });
  console.log(`[${arm}] mission lancée: ${mission.slice(0, 60)}...`);
  const result = spawnSync('node', [ORCHESTRATE, payload], { encoding: 'utf8', env, timeout: 30000 });
  if (result.status !== 0) {
    console.error(`[${arm}] refus de mission: ${(result.stderr || '').slice(0, 200)}`);
    return null;
  }
  try {
    return JSON.parse(result.stdout);
  } catch (_) {
    return null;
  }
}

function readOutcomes(orchestratorIds) {
  const sqlite = require(path.join(ROOT, 'backend/node_modules/sqlite'));
  const sqlite3 = require(path.join(ROOT, 'backend/node_modules/sqlite3'));
  return (async () => {
    const db = await sqlite.open({ filename: DB_PATH, driver: sqlite3.Database });
    const outcomes = [];
    for (const orchestratorId of orchestratorIds) {
      const agent = await db.get('SELECT status FROM agents WHERE id = ?', orchestratorId);
      const events = await db.all(
        `SELECT payload_json, event_type FROM telemetry_events
         WHERE agent_id = ? AND event_type IN ('EVIDENCE_REPORT','WORKER_DOSSIER','COGNITIVE_SYNTHESIS_COMPLETED','COGNITIVE_PERFORMANCE_RECORDED')
         ORDER BY created_at`, orchestratorId);
      const dossierEvents = await db.all(
        `SELECT payload_json FROM telemetry_events
         WHERE agent_id IN (SELECT id FROM agents WHERE parent_agent_id = ?)
           AND event_type IN ('EVIDENCE_REPORT','AGENT_COMPLETED')
         ORDER BY created_at`, orchestratorId);
      outcomes.push({
        orchestratorId,
        status: agent ? agent.status : 'unknown',
        cognitiveEvents: events.length,
        workerReports: dossierEvents.length
      });
    }
    const registry = await db.all('SELECT recipe_id, context, runs, observed_gain, useful_dossiers FROM cognitive_recipe_performance');
    await db.close();
    return { outcomes, registry };
  })();
}

function waitForCompletion(orchestratorIds, timeoutMs) {
  const sqlite = require(path.join(ROOT, 'backend/node_modules/sqlite'));
  const sqlite3 = require(path.join(ROOT, 'backend/node_modules/sqlite3'));
  return (async () => {
    const db = await sqlite.open({ filename: DB_PATH, driver: sqlite3.Database });
    const deadline = Date.now() + timeoutMs;
    const pending = new Set(orchestratorIds);
    while (pending.size > 0 && Date.now() < deadline) {
      for (const id of [...pending]) {
        const agent = await db.get('SELECT status FROM agents WHERE id = ?', id);
        if (agent && ['completed', 'error', 'failed', 'blocked', 'idle'].includes(agent.status)) {
          pending.delete(id);
        }
      }
      if (pending.size > 0) await new Promise((r) => setTimeout(r, 5000));
    }
    await db.close();
    return { completed: orchestratorIds.length - pending.size, timedOut: [...pending] };
  })();
}

async function main() {
  const config = args();
  const missions = MISSIONS.slice(0, config.missions);
  console.log(`=== Ablation runtime A/E — modèle ${config.model}, ${missions.length} mission(s) × 2 bras ===`);

  preheat(config.model);

  const launched = [];
  // Ordre alterné A, E, A, E… pour neutraliser la dérive entre bras
  for (let i = 0; i < missions.length; i += 1) {
    for (const arm of ['A', 'E']) {
      const handle = runMission(missions[i], arm, config);
      if (handle) launched.push({ arm, missionIndex: i, ...handle });
    }
  }
  console.log(`\n[dispatch] ${launched.length} mission(s) acceptée(s). Attente de complétion (max ${config.timeout}s)...`);

  const wait = await waitForCompletion(launched.map((l) => l.orchestratorId), config.timeout * 1000);
  console.log(`[attente] ${wait.completed}/${launched.length} terminées${wait.timedOut.length ? ` (timeout: ${wait.timedOut.length})` : ''}`);

  const { outcomes, registry } = await readOutcomes(launched.map((l) => l.orchestratorId));

  console.log('\n=== Résultats par mission ===');
  launched.forEach((entry, index) => {
    const outcome = outcomes[index] || {};
    console.log(`[${entry.arm}] mission ${entry.missionIndex + 1} — status=${outcome.status}, rapports worker=${outcome.workerReports}, events cognitifs=${outcome.cognitiveEvents}`);
  });

  console.log('\n=== Registre cognitive_recipe_performance (bras E) ===');
  if (registry.length === 0) {
    console.log('(vide — aucune synthèse cognitive persistée)');
  } else {
    registry.forEach((row) => console.log(`${row.recipe_id} | ctx=${row.context.slice(0, 50)} | runs=${row.runs} | gain=${row.observed_gain} | utiles=${row.useful_dossiers}`));
  }

  const report = {
    model: config.model,
    missions: missions.length,
    launched: launched.map((l) => ({ arm: l.arm, mission: l.missionIndex, orchestratorId: l.orchestratorId })),
    outcomes,
    registry,
    completed: wait.completed,
    timedOut: wait.timedOut,
    runAt: new Date().toISOString()
  };
  const reportPath = path.join(__dirname, 'results', `runtime-ablation-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n[rapport] ${reportPath}`);
}

main().catch((error) => { console.error(error); process.exit(1); });
