'use strict';
// Chantier B — la jointure mission <-> expérience Trinity.
// Une expérience trinity_<orch>_<uuid> porte 3 mondes terminés avec des
// EVIDENCE_REPORT ; merge/compare appelé avec l'ID de mission (mission_*)
// ou l'ID d'expérience (trinity_*) doit retrouver les 3 rapports.
process.env.GENOS_EPISTEMIC_RECEIPT_SECRET ||= 'trinity-merge-scope-test-secret';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const barrier = require('../src/services/trinityComparativeBarrier');
const trinityService = require('../src/services/trinityService');
const receiptService = require('../src/services/epistemicVerifierReceiptService');
const verifierTrust = require('../src/services/verifierTrustRegistry');
const supervisor = require('../bin/trinity-supervisor.cjs');
const actions = require('../bin/orchestratorActions.cjs');

const EXP = 'trinity_orch-1_exp1';
const MISSION = 'mission_abc';
const ORCH = 'orch-1';
const SNAPSHOT = 'a'.repeat(64);

// World 1 dominates worlds 2 and 3 on every shared pareto dimension.
const VECTORS = {
  1: { correctness: 0.95, coverage: 0.9, robustness: 0.85, reproducibility: 0.9, novelty: 0.8, constraintCoverage: 0.95, cost: 0.1, latency: 0.1, risk: 0.05, uncertainty: 0.05 },
  2: { correctness: 0.8, coverage: 0.7, robustness: 0.6, reproducibility: 0.85, novelty: 0.5, constraintCoverage: 0.9, cost: 0.4, latency: 0.4, risk: 0.2, uncertainty: 0.2 },
  3: { correctness: 0.75, coverage: 0.65, robustness: 0.55, reproducibility: 0.82, novelty: 0.4, constraintCoverage: 0.9, cost: 0.5, latency: 0.5, risk: 0.25, uncertainty: 0.25 }
};

function receipt(tag) {
  const digest = `sha256:${crypto.createHash('sha256').update(`merge-scope:${tag}`).digest('hex')}`;
  return receiptService.issueReceipt({ resultId: `merge-scope-${tag}`, status: 'verified',
    independent: true, evidenceDigest: digest, verifierDigest: verifierTrust.getVerifier('testResult').digest,
    independenceDescriptor: { actorId: `verifier-${tag}`, workspaceId: `ws-${tag}` } });
}

function evidenceReport(worldNumber) {
  const evidenceId = `ev-${worldNumber}`;
  const vector = VECTORS[worldNumber];
  return {
    outcome: 'success', hardConstraintsPassed: true, budgetStatus: 'within',
    claims: [{ statement: `World ${worldNumber} delivered its verified implementation slice.`, evidence: [evidenceId] }],
    tests: [], evidence: [{ id: evidenceId, verificationReceipt: receipt(`w${worldNumber}`) }],
    evidenceVector: vector,
    evidenceVectorEvidence: Object.fromEntries(Object.keys(vector).map((dim) => [dim, [evidenceId]]))
  };
}

async function makeDb() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`CREATE TABLE trinity_experiments (id TEXT PRIMARY KEY, mission_id TEXT, domain TEXT,
    mission_snapshot_hash TEXT, design_json TEXT, isolation_policy_json TEXT, budget_policy_json TEXT,
    status TEXT, decision_json TEXT, failure_reason TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  await db.exec(`CREATE TABLE trinity_experiment_transitions (id INTEGER PRIMARY KEY, experiment_id TEXT,
    from_status TEXT, to_status TEXT, actor TEXT, reason TEXT, evidence_ref TEXT)`);
  await db.exec(`CREATE TABLE trinity_worlds (id TEXT PRIMARY KEY, mission TEXT, world_number INTEGER, name TEXT,
    strategy TEXT, status TEXT, agent_id TEXT, experiment_id TEXT, chamber TEXT, snapshot_hash TEXT,
    workspace_root TEXT, evidence_vector_json TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  await db.exec('CREATE TABLE strategy_execution_runs (id TEXT PRIMARY KEY, agent_id TEXT, status TEXT)');
  await db.exec(`CREATE TABLE telemetry_events (agent_id TEXT, event_type TEXT, payload_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  await db.exec('CREATE TABLE mission_agents (mission_id TEXT, agent_id TEXT, role TEXT)');
  await db.exec('CREATE TABLE agents (id TEXT PRIMARY KEY, status TEXT, workspace_id TEXT, name TEXT, parent_agent_id TEXT)');
  await db.exec('CREATE TABLE workspaces (id TEXT PRIMARY KEY, path TEXT)');
  await db.run(`INSERT INTO trinity_experiments (id, mission_id, domain, mission_snapshot_hash, design_json,
    isolation_policy_json, budget_policy_json, status, decision_json, failure_reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, EXP, EXP,
    'software_engineering', SNAPSHOT, JSON.stringify({ orchestratorId: ORCH }), '{}', '{}', 'sealed_running', null, null);
  await db.run('INSERT INTO mission_agents VALUES (?, ?, ?)', MISSION, ORCH, 'orchestrator');
  for (let worldNumber = 1; worldNumber <= 3; worldNumber += 1) {
    const agentId = `w${worldNumber}`;
    await db.run(`INSERT INTO trinity_worlds (id, mission, world_number, name, strategy, status, agent_id,
      experiment_id, chamber, snapshot_hash, workspace_root, evidence_vector_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      `${EXP}_world_${worldNumber}`, 'fixture mission', worldNumber, `World ${worldNumber}`,
      `role_${worldNumber}`, 'running', agentId, EXP, 'direct', SNAPSHOT, null, null);
    await db.run('INSERT INTO agents (id, status) VALUES (?, ?)', agentId, 'completed');
    await db.run('INSERT INTO strategy_execution_runs VALUES (?, ?, ?)', `run-${agentId}`, agentId, 'completed');
    await db.run('INSERT INTO telemetry_events (agent_id, event_type, payload_json) VALUES (?, ?, ?)', agentId,
      'EVIDENCE_REPORT', JSON.stringify({ executionRunId: `run-${agentId}`, evidenceReport: evidenceReport(worldNumber) }));
  }
  return db;
}

async function runMerge(db, request) {
  const chunks = [];
  const write = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => { chunks.push(String(chunk)); return true; };
  try {
    await actions.handleAction({ db, action: 'merge_trinity', request, orchestratorId: ORCH, task: 'fixture' });
  } finally {
    process.stdout.write = write;
  }
  return JSON.parse(chunks.join(''));
}

async function main() {
  // 1. Les rapports sont retrouvés depuis l'ID de mission comme depuis l'ID d'expérience.
  const byMission = await barrier.buildWorldReportsFromMission(await makeDb(), MISSION);
  assert.equal(byMission.length, 3, 'mission id resolves the 3 world reports');
  const db = await makeDb();
  const byExperiment = await barrier.buildWorldReportsFromMission(db, EXP);
  assert.equal(byExperiment.length, 3, 'experiment id resolves the 3 world reports');

  // 2. La comparaison produit 3 mondes scorés et une décision PROMOTE_WORLD motivée.
  const scope = await barrier.resolveTrinityScope(db, MISSION);
  assert.equal(scope.experimentId, EXP);
  const scopeByExperiment = await barrier.resolveTrinityScope(db, EXP);
  assert.equal(scopeByExperiment.experimentId, EXP);
  const merged = trinityService.mergeTrinityEvidence(byMission, { domain: 'software_engineering', threshold: 0.70 });
  assert.equal(merged.comparativeAnalysis.scoredWorlds.length, 3);
  assert.equal(merged.outcome, 'PROMOTE_WORLD');
  assert.equal(merged.selectedWorld, 1);

  // 3. merge_trinity accepte les deux formes d'ID et refuse seulement l'inconnu.
  const viaMission = await runMerge(await makeDb(), { missionId: MISSION });
  assert.equal(viaMission.trinityMerge.comparativeAnalysis.scoredWorlds.length, 3);
  assert.equal(viaMission.trinityMerge.outcome, 'PROMOTE_WORLD');
  const viaExperiment = await runMerge(await makeDb(), { experimentId: EXP });
  assert.equal(viaExperiment.trinityMerge.comparativeAnalysis.scoredWorlds.length, 3);
  assert.equal(viaExperiment.trinityMerge.outcome, 'PROMOTE_WORLD');
  await assert.rejects(runMerge(await makeDb(), { missionId: 'unknown-mission' }), /was not found/);
  const explicit = await runMerge(await makeDb(), { missionId: 'unknown-mission',
    worldReports: [1, 2, 3].map((worldNumber) => ({ worldNumber, report: evidenceReport(worldNumber) })) });
  assert.ok(explicit.trinityMerge, 'explicit world reports still merge without a known experiment');

  // 4. Le superviseur attend les 3 mondes via l'ID de mission et évite le doublon.
  const supervised = await makeDb();
  const workers = await supervisor.waitForWorkers(supervised, { missionId: MISSION, expectedWorlds: 3, timeoutMs: 50 });
  assert.equal(workers.length, 3);
  assert.ok(workers.every((worker) => worker.status === 'completed'));
  assert.equal(await supervisor.comparisonAlreadyRecorded(supervised, EXP), false);
  await trinityService.recordWorldComparison(supervised, { missionId: EXP, orchestratorId: ORCH,
    comparison: merged.comparativeAnalysis, decision: { canMerge: merged.canMerge } });
  assert.equal(await supervisor.comparisonAlreadyRecorded(supervised, EXP), true);

  console.log('Trinity merge experiment scope: PASS (scoredWorlds: 3, PROMOTE_WORLD world 1).');
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
