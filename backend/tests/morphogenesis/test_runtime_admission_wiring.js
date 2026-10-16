'use strict';

const assert = require('node:assert/strict');
const { openDatabase } = require('../helpers/biologyDatabase');
const { createTopologyRegistry } = require('../../src/services/morphogenesis/registry/topologyRegistry');
const { topologyExpression } = require('../../src/services/morphogenesis/expression/morphologyExpression');
const { compileExpression } = require('../../src/services/morphogenesis/graph/morphologyCompiler');
const runtimeAdmission = require('../../src/services/morphogenesis/morphogenesisRuntimeAdmission');
const { admitMorphogenesisStrategy } =
  require('../../src/services/morphogenesis/morphogenesisStrategyAdmission');

const registry = createTopologyRegistry();
const required = registry.get('a_team').requiredCapabilities;

async function seedPool(db) {
  await db.exec(`CREATE TABLE agents (id TEXT PRIMARY KEY, status TEXT, role TEXT,
      metadata_json TEXT, execution_mode TEXT, updated_at TEXT);
    CREATE TABLE garage_queue (request_id TEXT PRIMARY KEY, worker_id TEXT,
      status TEXT, phase TEXT, lease_id TEXT, lease_expires_at TEXT);`);
  for (const id of ['w-1', 'w-2']) {
    await db.run(`INSERT INTO agents(id, status, role, metadata_json, execution_mode)
      VALUES (?, 'idle', 'analyst', '{"workerKind":"analyst"}', 'worker')`, id);
  }
}

function candidate() {
  return { id: 'topology:a_team:default', candidateId: 'topology:a_team:default',
    kind: 'TOPOLOGY', topology: 'a_team', variant: null, eligible: true,
    proposalEligible: true, validation: { valid: true }, requiredCapabilities: required };
}

function policyFor(selected) {
  return { kind: 'conditional_morphogenesis_policy', status: 'proposed',
    decision: { recipe: { candidateId: selected.id, topology: 'a_team', variant: null } },
    portfolio: { candidates: [selected],
      ranking: { decision: { decision: 'PROPOSE', selectedId: selected.id },
        candidates: [{ id: selected.id, topology: 'a_team', variant: null,
          eligible: true, proposalEligible: true }] } } };
}

function planFor(count) {
  const assignments = Array.from({ length: count }, () => ({ workerKind: 'analyst',
    capabilities: required, tokenBudget: 25 }));
  return { selectedTopology: 'a_team', selectedVariant: 'default',
    morphologyPatch: { graph: compileExpression(topologyExpression('a_team'),
      { mission: 'mission', missionId: 'mission-1', globalBudget: { tokens: 50 } }) },
    workerAssignments: assignments, allocatedTokens: 25 * count,
    requestedTools: ['genos_change_organization'] };
}

function gatesFor(input) {
  const { policy, plan, receipts, now } = input;
  return { policy, actualPlan: plan, registry, now,
    quiescence: { confirmed: true, observedAt: now, activeProcesses: 0,
      databaseRunningWorkers: 0, activeLeases: 0 },
    topologyCapabilities: required, availableWorkerKinds: ['analyst'],
    budget: { availableTokens: 100 },
    parentLease: { allowedTools: ['genos_change_organization'] },
    resourceResolution: receipts.resolution, resourceReservation: receipts.reservation };
}

async function agentStatus(db, id) {
  const row = await db.get('SELECT status FROM agents WHERE id = ?', id);
  return row.status;
}

async function main() {
  const db = openDatabase();
  try {
    await seedPool(db);
    const selected = candidate();
    const policy = policyFor(selected);
    const plan = planFor(2);
    const assignments = plan.workerAssignments;
    const receipts = await runtimeAdmission.resolveAndReserve({ db, assignments,
      daemonAllowed: false, now: Date.now() });
    assert.equal(receipts.resolution.status, 'READY_FOR_ADMISSION');
    assert.equal(receipts.reservation.reserved, true);
    assert.equal(new Set(receipts.reservation.workers.map((w) => w.instanceId)).size, 2);
    const now = Date.now();
    const admitted = admitMorphogenesisStrategy(gatesFor({ policy, plan, receipts, now }));
    assert.equal(admitted.status, 'admitted');
    assert.equal(admitted.executionAuthorized, true);
    assert.equal(await agentStatus(db, 'w-1'), 'running');
    assert.equal(await agentStatus(db, 'w-2'), 'running');
    const overPlan = planFor(3);
    const denied = admitMorphogenesisStrategy(gatesFor({ policy, plan: overPlan, receipts, now: Date.now() }));
    assert.equal(denied.status, 'denied');
    assert.equal(denied.reason, 'resource_resolution_plan_mismatch');
    const released = await runtimeAdmission.releaseAdmissionReservation(db, admitted);
    assert.equal(released, 2);
    assert.equal(await agentStatus(db, 'w-1'), 'idle');
    assert.equal(await agentStatus(db, 'w-2'), 'idle');
    const again = await runtimeAdmission.resolveAndReserve({ db, assignments,
      daemonAllowed: false, now: Date.now() });
    assert.equal(again.reservation.reserved, true);
    await runtimeAdmission.releaseAdmissionReservation(db,
      { resourceReservation: again.reservation });
  } finally {
    await db.close();
  }
  console.log('Runtime admission wiring: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

