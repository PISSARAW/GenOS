'use strict';

/**
 * Banc adversarial des organes réflexifs (ablation + circuits synthétiques).
 *
 * Pour chaque service de la session : entrées ablatées (null, agent manquant,
 * stockage en panne) ne lèvent jamais ou lèvent documenté, et retournent
 * null/''/insufficient_data/unavailable — jamais de faux nombre. Puis les
 * scores sur circuits synthétiques (synchronisé vs indépendant) et la preuve
 * que l'apprentissage change le comportement (bandit entraîné vs froid).
 * Garde doctrinal : aucun nouveau service ne revendique conscience,
 * sentience, qualia ou phénoménalité (anglais).
 *
 * Hermétique : n'exige pas SQLite natif (stub en mémoire).
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const nativeLoad = Module._load;
Module._load = function hook(request) {
  if (request === 'sqlite3' || /(^|[\\/])db$/.test(request)) return {};
  return nativeLoad.apply(this, arguments);
};

const SERVICES = path.join(__dirname, '..', 'src', 'services');
const HERE = (name) => require(path.join(SERVICES, name));

function stubDb() {
  const tables = new Map();
  return {
    get: async (sql, s, k) => (tables.has(`${s}|${k}`) ? { payload_json: tables.get(`${s}|${k}`) } : null),
    all: async () => [],
    run: async (sql, s, k, p) => {
      if (s && !String(sql).includes('adaptive_state_events')) tables.set(`${s}|${k}`, p);
    },
    seed: (scope, key, value) => tables.set(`${scope}|${key}`, JSON.stringify(value))
  };
}

function brokenDb() {
  return {
    get: async () => { throw new Error('down'); },
    all: async () => { throw new Error('down'); },
    run: async () => { throw new Error('down'); }
  };
}

async function testGracefulDegradation() {
  const bad = brokenDb();
  assert.strictEqual(await HERE('agentSelfBlocks').loadUnifiedSelfBlocks(null, null, {}).then((r) => r.agentSelfBlock), '');
  assert.strictEqual(await HERE('coreSelfService').loadCoreSelf(bad, 'a'), null);
  assert.deepStrictEqual(await HERE('efferenceCopyService').discharge(bad, 'a', { eventType: 'X', payload: {} }), { matched: false });
  assert.deepStrictEqual((await HERE('worldModelService').observeTransition(bad, 'a', { success: true })).matched, false);
  assert.strictEqual((await HERE('ignitionService').charge(bad, 'a', { weight: 1 })).ignited, false);
  assert.strictEqual(await HERE('reverberationService').updateFromEvent(bad, 'a', { eventType: 'X', detail: 'y', payload: {} }), null);
  assert.strictEqual((await HERE('predictiveHierarchyService').routeEvent(bad, 'a', { eventType: 'AGENT_FAILED' })), null);
  assert.strictEqual((await HERE('integrationProxyService').measure(bad, 'a', {})).status, 'unavailable');
  assert.strictEqual((await HERE('causalIntegrationService').analyzeCircuit(bad, 'a', {})).status, 'unavailable');
  assert.strictEqual((await HERE('reportReconstructionService').reconstruct(bad, 'a', {})).status, 'unavailable');
  assert.deepStrictEqual(await HERE('causalLedgerService').trace(bad, 'a', { id: 'x' }), []);
  assert.strictEqual((await HERE('idleTickService').tick(bad, 'a', {})).status, 'skipped');
  assert.strictEqual((await HERE('metacognitionBenchService').runBench(bad, 'a', {})).status, 'unavailable');
  assert.strictEqual((await HERE('attentionSchemaBenchService').runAttentionAudit(bad, 'a', {})).status, 'unavailable');
  assert.deepStrictEqual(await HERE('attentionProbeService').checkReport(bad, 'a', []), []);
  assert.strictEqual(await HERE('routingBanditService').observe(bad, { routeUri: 'u', success: true }), null);
  assert.deepStrictEqual(await HERE('counterfactualRolloutService').scoreBranches({}).winner, undefined);
  console.log('ok - degradation gracieuse (16 organes, stockage en panne)');
}

async function testIgnitionAndHierarchy() {
  const ignition = HERE('ignitionService');
  const db = stubDb();
  await ignition.charge(db, 'a', { weight: 0.3, now: 1000 });
  await ignition.charge(db, 'a', { weight: 0.3, now: 2000 });
  await ignition.charge(db, 'a', { weight: 0.3, now: 3000 });
  const burst = await ignition.charge(db, 'a', { weight: 0.3, now: 4000 });
  assert.strictEqual(burst.ignited, true);
  const hierarchy = HERE('predictiveHierarchyService');
  const db2 = stubDb();
  const fail = { eventType: 'AGENT_FAILED', severity: 'error', payload: {} };
  await hierarchy.routeEvent(db2, 'a', fail);
  await hierarchy.routeEvent(db2, 'a', fail);
  const third = await hierarchy.routeEvent(db2, 'a', fail);
  assert.strictEqual(third.propagate, 'strategy');
  console.log('ok - ignition (burst au 4e) et hierarchie (3 erreurs -> strategie)');
}

async function testEfferenceAndWorld() {
  const efference = HERE('efferenceCopyService');
  const world = HERE('worldModelService');
  const db = stubDb();
  await efference.predict(db, 'a', { action: 'go', expectedTypes: ['DID'] });
  const hit = await efference.discharge(db, 'a', { eventType: 'DID', detail: 'd', payload: {} });
  assert.strictEqual(hit.matched, true);
  assert.strictEqual((await efference.discharge(db, 'a', { eventType: 'DID', detail: 'd', payload: {} })).matched, false);
  const chain = await world.predictTrajectory(db, 'a', { actions: [{ action: 'x' }, { action: 'y' }] });
  const observed = await world.observeTrajectory(db, 'a', { chainId: chain.chainId, outcomes: [{ success: true }, { success: false }] });
  assert.deepStrictEqual(observed.surprises, [0, 1]);
  console.log('ok - efference (usage unique) et trajectoire (surprise localisee)');
}

async function testMetacognitionLoop() {
  const bench = HERE('metacognitionBenchService');
  const abstention = HERE('abstentionService');
  const db = stubDb();
  const entries = [];
  for (let i = 0; i < 6; i++) entries.push({ actionId: `r${i}`, attributedToSelf: true, predictionError: 0, causalConfidence: 0.8 });
  for (let i = 6; i < 12; i++) entries.push({ actionId: `r${i}`, attributedToSelf: true, predictionError: 1, causalConfidence: 0.6 });
  db.seed('core_self', 'a', { entries });
  const report = await bench.runBench(db, 'a', {});
  assert.strictEqual(report.status, 'measured');
  assert.ok(report.overconfidence > 0.15);
  const floor = abstention.floorFor(report, 0.5);
  assert.ok(floor > 0.5 && floor <= 0.8);
  const verdict = abstention.evaluateAbstention({ confidence: 0.4, uncertainty: 0.7, integrity: 1, floor });
  assert.strictEqual(verdict.abstain, true);
  console.log('ok - banc (surconfiance) -> plancher resserre -> opt-out');
}

async function testLearningChangesBehavior() {
  const bandit = HERE('routingBanditService');
  const db = stubDb();
  for (let i = 0; i < 8; i++) {
    await bandit.observe(db, { routeUri: 'good://m', success: true, costUsd: 0.01, latencyMs: 500 });
    await bandit.observe(db, { routeUri: 'bad://m', success: false });
  }
  const trained = await bandit.chooseWithGuardrails(db, ['bad://m', 'good://m'], { canaryRate: 1, canaryKey: 'k', minPulls: 5 });
  const cold = await bandit.chooseWithGuardrails(stubDb(), ['bad://m', 'good://m'], { canaryRate: 1, canaryKey: 'k', minPulls: 5 });
  assert.strictEqual(trained.choice, 'good://m');
  assert.strictEqual(cold.mode, 'policy');
  assert.notStrictEqual(trained.choice, cold.choice);
  console.log('ok - apprentissage change le choix (bandit vs politique froide)');
}

async function testAblationHurts() {
  const causal = HERE('causalIntegrationService');
  const pad = (n) => String(n).padStart(2, '0');
  const rows = [];
  for (let b = 0; b < 32; b += 2) {
    const stamp = `2026-09-26 10:${pad(Math.floor(b / 2))}:${pad((b % 2) * 30)}`;
    rows.push({ agent_id: 'a1', eventType: 'X', created_at: stamp });
    rows.push({ agent_id: 'a2', eventType: 'X', created_at: stamp });
  }
  const db = stubDb();
  db.all = async (sql) => {
    if (sql.includes('WHERE parent_agent_id')) return [{ id: 'a1' }, { id: 'a2' }];
    if (sql.includes('FROM telemetry_events')) return rows;
    return [];
  };
  const realNow = Date.now;
  Date.now = () => Date.parse('2026-09-26T10:20:00Z');
  const full = await causal.analyzeCircuit(db, 'o', {});
  Date.now = realNow;
  assert.strictEqual(full.status, 'measured');
  assert.strictEqual(full.nodeAblations.length, 3);
  const byNode = Object.fromEntries(full.nodeAblations.map((entry) => [entry.node, entry.dIntegration]));
  assert.ok(byNode.o >= byNode.a1 && byNode.o >= byNode.a2, 'le noeud muet devrait etre le maillon faible: ' + JSON.stringify(byNode));
  console.log('ok - ablation revele le maillon faible (noeud muet)');
}

function testNoConsciousnessClaims() {
  const forbidden = ['consciousness', 'sentient', 'qualia', 'phenomenal'];
  const files = [
    'agentSelfBlocks.js', 'coreSelfService.js', 'abstentionService.js', 'metacognitionBenchService.js',
    'efferenceCopyService.js', 'worldModelService.js', 'ignitionService.js', 'reverberationService.js',
    'idleTickService.js', 'sleepConsolidationService.js', 'predictiveHierarchyService.js',
    'integrationProxyService.js', 'causalIntegrationService.js', 'reportReconstructionService.js',
    'selectiveSignalService.js', 'counterfactualRolloutService.js', 'routingBanditService.js',
    'valenceService.js', 'causalLedgerService.js', 'attentionSchemaBenchService.js', 'attentionProbeService.js'
  ];
  for (const file of files) {
    const source = fs.readFileSync(path.join(SERVICES, file), 'utf8').toLowerCase();
    for (const word of forbidden) {
      assert.ok(!source.includes(word), `${file} revendique '${word}'`);
    }
  }
  console.log('ok - garde doctrinal (21 services, 0 revendication)');
}

async function run() {
  await testGracefulDegradation();
  await testIgnitionAndHierarchy();
  await testEfferenceAndWorld();
  await testMetacognitionLoop();
  await testLearningChangesBehavior();
  await testAblationHurts();
  testNoConsciousnessClaims();
  console.log('BANC ADVERSARIALE VERT');
}

run().catch((error) => {
  console.error('BANC ROUGE', error);
  process.exit(1);
});
