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
    run: async (...args) => {
      const [sql, s, k, p] = args;
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
  const hit = await efference.discharge(db, 'a', { eventType: 'DID', detail: 'd', payload: { eventId: 'unrelated' } });
  assert.strictEqual(hit.matched, true);
  await efference.predict(db, 'a', { action: 'bound action', actionId: 'source-7', expectedTypes: ['ORCHESTRATION_ACTION_EXECUTED'] });
  const bound = await efference.discharge(db, 'a', {
    eventType: 'ORCHESTRATION_ACTION_EXECUTED', payload: { eventId: 'source-7' }
  });
  assert.strictEqual(bound.matched, true, 'action receipt must consume only its correlated efference copy');
  assert.strictEqual(bound.strength, 1);
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
    rows.push({ agent_id: 'a1', event_type: 'X', created_at: stamp });
    rows.push({ agent_id: 'a2', event_type: 'X', created_at: stamp });
    rows.push({ agent_id: 'o', event_type: 'AGENT_COMPLETED', created_at: stamp });
  }
  const db = stubDb();
  db.all = async (sql) => {
    if (sql.includes('WHERE parent_agent_id')) return [{ id: 'a1' }, { id: 'a2' }];
    if (sql.includes('FROM telemetry_events')) return rows.map((row) => ({ ...row, eventType: row.event_type }));
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
  assert.strictEqual(full.outcomeSignal, true, 'outcome snake_case non detecte');
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

async function testHoldoutProtocol() {
  const bandit = HERE('routingBanditService');
  const validation = HERE('validationProtocolService');
  const train = [];
  const dev = [];
  const holdout = [];
  for (let i = 0; i < 14; i++) {
    const small = i % 2 === 0;
    const item = { id: `q${i}`, arm: small ? 'a://m' : 'b://m', tokens: small ? 400 : 7000, success: true };
    if (i < 8) train.push(item);
    else if (i < 10) dev.push(item);
    else holdout.push(item);
  }
  const protocol = validation.createValidationProtocol({
    protocolId: 'bandit-holdout-v1',
    revision: '1',
    hypothesis: 'trained bandit top-1 picks the succeeding arm per context on held-out log',
    corpus: { train, dev, reserved: holdout },
    seeds: [11, 22],
    criteria: { primaryMetric: 'top1-success-rate', direction: 'higher', threshold: 0.75 }
  });
  const manifest = protocol.manifestHash;
  const db = stubDb();
  for (const item of [...train, ...dev]) {
    await bandit.observe(db, { routeUri: item.arm, success: true, costUsd: 0.01, latencyMs: 500, promptTokens: item.tokens });
    await bandit.observe(db, { routeUri: item.arm === 'a://m' ? 'b://m' : 'a://m', success: false, costUsd: 0.01, latencyMs: 500, promptTokens: item.tokens });
  }
  validation.verifyManifest(protocol, manifest);
  let hits = 0;
  for (const item of holdout) {
    const rec = await bandit.recommend(db, { routes: ['a://m', 'b://m'], promptTokens: item.tokens });
    if (rec.ordering[0].uri === item.arm) hits += 1;
  }
  const rate = hits / holdout.length;
  assert.ok(rate >= 0.75, `holdout top-1 ${rate} < 0.75 (manifest ${manifest.slice(0, 12)})`);
  console.log(`ok - holdout protocole gele (manifest ${manifest.slice(0, 12)}, top-1 ${rate})`);
}

async function testWorldToRouting() {
  const bandit = HERE('routingBanditService');
  const world = HERE('worldModelService');
  const db = stubDb();
  for (let i = 0; i < 6; i++) {
    await world.recordSample(db, 'routing', { action: 'good://m', delta: { success: true, costUsd: 0.01, latencyMs: 500 } });
    await world.recordSample(db, 'routing', { action: 'bad://m', delta: { success: false, costUsd: 0.5, latencyMs: 20000 } });
  }
  const rec = await bandit.recommend(db, { routes: ['bad://m', 'good://m'] });
  assert.strictEqual(rec.ordering[0].uri, 'good://m', 'monde non consomme: ' + JSON.stringify(rec.ordering));
  console.log('ok - monde -> routage (froid mais informe)');
}

async function testLoggedHoldout() {
  const bandit = HERE('routingBanditService');
  const rows = [];
  for (let i = 0; i < 30; i++) {
    const good = i % 2 === 0;
    rows.push({
      id: `u${i}`,
      metadata_json: JSON.stringify(good
        ? { model: 'good://m', costUsd: 0.01, latencyMs: 500 }
        : { model: 'bad://m', costUsd: 0.8, latencyMs: 20000 })
    });
  }
  const db = stubDb();
  db.all = async (sql) => (sql.includes('FROM usage_ledger') ? rows : []);
  const rep = await bandit.evaluateLoggedHoldout(db, {});
  assert.strictEqual(rep.status, 'measured', JSON.stringify(rep));
  assert.ok(Number.isFinite(rep.mae) && rep.mae >= 0 && rep.mae <= 1.5, 'mae=' + rep.mae);
  assert.strictEqual(rep.n, 30);
  assert.deepStrictEqual((await bandit.evaluateLoggedHoldout(stubDb(), {})).status, 'insufficient_data');
  console.log(`ok - holdout logge (n=${rep.n}, mae=${rep.mae.toFixed(3)})`);
}

async function testUncitedFactual() {
  const compiler = HERE('reportCompilerService');
  const graph = { nodes: [{ id: 'claim_1', kind: 'claim' }] };
  const clean = compiler.verifyRendering(graph, [{ text: 'Voir [claim:claim_1] svp.' }]);
  assert.deepStrictEqual(clean.uncitedFactual, []);
  assert.strictEqual(clean.ok, true);
  const dirty = compiler.verifyRendering(graph, [{ text: 'Le test passe avec 42 cas verifies.' }]);
  assert.strictEqual(dirty.uncitedFactual.length, 1);
  assert.strictEqual(dirty.ok, false);
  const hedged = compiler.verifyRendering(graph, [{ text: 'Peut-etre que cela pourrait marcher.' }]);
  assert.deepStrictEqual(hedged.uncitedFactual, []);
  console.log('ok - factual non cite detecte, hedge epargne');
}

async function testShadowReplay() {
  const shadow = HERE('shadowReplayService');
  const fail = { eventType: 'AGENT_FAILED', detail: 'boom', severity: 'error', payload: {} };
  const info = { eventType: 'AGENT_STEP', detail: 'step', severity: 'info', payload: {} };
  const events = [fail, info, fail, info, fail];
  const runA = await shadow.replayControlPlane(events, { agentId: 'r' });
  const runB = await shadow.replayControlPlane(events, { agentId: 'r' });
  assert.deepStrictEqual(runA, runB, 'rejeu non deterministe');
  assert.strictEqual(runA.propagations.strategy, 1, JSON.stringify(runA));
  const dropFail = await shadow.replayControlPlane(events, { agentId: 'r', dropEventTypes: ['AGENT_FAILED'] });
  assert.ok(dropFail.propagations.strategy < runA.propagations.strategy, 'ablation sans effet');
  const dropOther = await shadow.replayControlPlane(events, { agentId: 'r', dropEventTypes: ['NOPE'] });
  assert.deepStrictEqual({ ...dropOther }, { ...runA }, 'temoin non nul');
  assert.deepStrictEqual((await shadow.ablateAndCompare(null, null, {})).status, 'insufficient_data');
  // Ledger d'appels.
  const db = stubDb();
  const entry = await shadow.recordAttempt(db, { uri: 'u', success: true, costUsd: 0.1, latencyMs: 100 });
  assert.strictEqual(entry.uri, 'u');
  assert.strictEqual(await shadow.recordAttempt(db, {}), null);
  console.log('ok - shadow deterministe, ablation causale, temoin nul');
}

async function testNliVerdict() {
  const compiler = HERE('reportCompilerService');
  assert.strictEqual(compiler.nliVerdict('Le test passe avec 42 cas.', ['log: 42 cas passes']), 'entailment');
  assert.strictEqual(compiler.nliVerdict('Le test passe avec 42 cas.', ['log: 7 cas passes']), 'contradiction');
  assert.strictEqual(compiler.nliVerdict('Le test ne passe pas.', ['log: tous les tests passent']), 'contradiction');
  assert.strictEqual(compiler.nliVerdict('Quelque chose change.', ['log vide']), 'neutral');
  assert.strictEqual(compiler.nliVerdict('', []), 'unverifiable');
  console.log('ok - NLI deterministe (nombres, polarite, citation)');
}

async function testPolicyMasking() {
  const masking = HERE('policyMaskingService');
  const world = HERE('worldModelService');
  const db = stubDb();
  for (let i = 0; i < 6; i++) {
    await world.recordSample(db, 'routing', { action: 'flaky://m', delta: { success: false } });
    await world.recordSample(db, 'routing', { action: 'solid://m', delta: { success: true } });
  }
  const masked = await masking.maskLease(db, ['flaky://m', 'solid://m'], {});
  assert.deepStrictEqual(masked.lease, ['solid://m'], JSON.stringify(masked));
  assert.strictEqual(masked.masked[0].tool, 'flaky://m');
  const single = await masking.maskLease(db, ['flaky://m'], {});
  assert.deepStrictEqual(single.lease, ['flaky://m'], 'fail-soft viole');
  const cold = await masking.maskLease(stubDb(), ['a://x', 'b://x'], {});
  assert.deepStrictEqual(cold.lease, ['a://x', 'b://x'], 'sans historique, intact');
  console.log('ok - masking borne, fail-soft, froid intact');
}

async function testCanaryExperiment() {
  const bandit = HERE('routingBanditService');
  const experiment = HERE('canaryExperimentService');
  const rows = [];
  for (let i = 0; i < 40; i++) {
    const good = i % 2 === 0;
    rows.push({ id: `u${i}`, metadata_json: JSON.stringify(good ? { model: 'good://m', costUsd: 0.01, latencyMs: 500 } : { model: 'bad://m', costUsd: 0.8, latencyMs: 20000 }) });
  }
  const db = stubDb();
  db.all = async (sql) => (sql.includes('FROM usage_ledger') ? rows : []);
  const frozen = await experiment.freezeExperiment(db, {});
  assert.ok(frozen.manifestHash && frozen.manifestHash.length >= 16, 'manifest manquant');
  const run = await experiment.runExperiment(db, {});
  assert.strictEqual(run.passed, true, JSON.stringify(run));
  assert.strictEqual(run.replicated, true);
  assert.ok(await bandit.canaryAllowed(db), 'gate ouverte attendue');
  // Seuil impossible -> echec -> gate fermee -> politique forcee.
  const db2 = stubDb();
  db2.all = async (sql) => (sql.includes('FROM usage_ledger') ? rows : []);
  await experiment.freezeExperiment(db2, { threshold: 0 });
  const failed = await experiment.runExperiment(db2, {});
  assert.strictEqual(failed.passed, false);
  assert.strictEqual(await bandit.canaryAllowed(db2), false, 'gate aurait du fermer');
  const forced = await bandit.chooseWithGuardrails(db2, ['bad://m', 'good://m'], { canaryRate: 1, canaryKey: 'k', minPulls: 1 });
  assert.strictEqual(forced.mode, 'policy');
  assert.strictEqual(forced.reason, 'gate-closed');
  // Sans experience -> gate ouverte par defaut.
  assert.strictEqual(await bandit.canaryAllowed(stubDb()), true);
  console.log('ok - experience gelee, replicats, gate ouvre/ferme');
}

async function testWorkerTagGate() {
  const compiler = HERE('reportCompilerService');
  assert.deepStrictEqual(compiler.resolveWorkerTags({ claims: [{ statement: 'vu [worker:w1]' }] }, ['w1', 'w2']), []);
  assert.deepStrictEqual(compiler.resolveWorkerTags({ claims: [{ statement: 'vu [worker:zx]' }] }, ['w1']), ['[worker:zx]']);
  assert.deepStrictEqual(compiler.resolveWorkerTags(null, null), []);
  const prompt = fs.readFileSync(path.join(SERVICES, 'agentEvidence', 'workerEvidence.js'), 'utf8');
  assert.ok(prompt.includes('[worker:<workerId>]'), 'consigne de tags manquante');
  console.log('ok - gate des tags worker (inconnu rejete)');
}

async function run() {
  await testGracefulDegradation();
  await testIgnitionAndHierarchy();
  await testEfferenceAndWorld();
  await testMetacognitionLoop();
  await testLearningChangesBehavior();
  await testAblationHurts();
  await testHoldoutProtocol();
  await testWorldToRouting();
  await testLoggedHoldout();
  await testUncitedFactual();
  await testShadowReplay();
  await testNliVerdict();
  await testPolicyMasking();
  await testCanaryExperiment();
  await testWorkerTagGate();
  testNoConsciousnessClaims();
  console.log('BANC ADVERSARIALE VERT');
}

run().catch((error) => {
  console.error('BANC ROUGE', error);
  process.exit(1);
});
