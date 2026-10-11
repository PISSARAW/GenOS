'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { migrateHolobiontSessions } = require('../src/db/migrations/migrateHolobiontSessions');
const { migrateHolobiontVariantEvents } = require('../src/db/migrations/migrateHolobiontVariantEvents');
const { migrateHolobiontContracts } = require('../src/db/migrations/migrateHolobiontContracts');
const store = require('../src/services/holobionte/holobiontStore');
const controller = require('../src/services/holobionte/variants/variantRuntimeController');
const boundary = require('../src/services/holobionte/variants/toolOperationBoundary');

const manifest = { name: 'calculator', version: '1', permissions: ['compute'],
  inputSchema: { type: 'object', properties: { a: { type: 'number' } }, required: ['a'], additionalProperties: false },
  outputSchema: { type: 'object', properties: { result: { type: 'number' } }, required: ['result'] } };

async function contractRevision(input) {
  const { db, session, revision, status, actions = ['compute'] } = input;
  const contract = { contractId: 'contract-1', hostId: session.hostId, symbiontId: 'sym-1',
    status, toolLeases: ['calculator'], authorityScope: { level: 'CAPABILITY', actions } };
  await db.run(`INSERT INTO holobiont_symbiosis_contracts
    (contract_id, revision, holobiont_id, host_id, symbiont_id, constitution_revision, status, contract_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, 'contract-1', revision, session.holobiontId,
  session.hostId, 'sym-1', 1, status, JSON.stringify(contract));
}

function invocation(session, calls) {
  return { holobiontId: session.holobiontId, expectedSessionRevision: session.revision,
    operation: 'executeToolInvocation', runtimeInput: { symbiontId: 'sym-1', manifest,
      value: { a: 2 }, leasedPermissions: ['compute', 'network'],
      toolLease: { toolName: 'calculator', expiresAt: '2099-01-01' }, verifyLease: () => true,
      verifyHealth: () => true, isRevoked: () => false,
      execute: async (value) => { calls.count += 1; return { result: value.a + 1 }; } },
    evidenceRefs: ['tool:test'], verifyEvaluationEvidence: ({ result }) => result.executed === true && result.accepted === true };
}

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await migrateHolobiontSessions(db);
    await migrateHolobiontVariantEvents(db);
    await migrateHolobiontContracts(db);
    const opened = await store.createSession(db, { hostId: 'tool-host', missionId: 'tool-mission' });
    const selected = await controller.selectPersistentVariant(db, {
      holobiontId: opened.holobiontId, expectedSessionRevision: opened.revision,
      variantId: 'tool', fitContext: { capabilities: ['tool-sandbox'], immunePlaneAvailable: true }
    });
    await store.appendEvent(db, { holobiontId: opened.holobiontId, expectedRevision: selected.sessionRevision,
      eventType: 'SYMBIONT_ADMITTED', payload: { symbiontId: 'sym-1' } });
    const calls = { count: 0 };
    let session = await store.getSession(db, opened.holobiontId);
    await assert.rejects(() => controller.evaluatePersistentVariant(db, invocation(session, calls)),
      (error) => error.code === 'HOLOBIONT_TOOL_OPERATION_REFUSED');
    assert.equal(calls.count, 0);
    session = await store.getSession(db, opened.holobiontId);
    assert.equal(session.variantState.latestEvaluation.status, 'REFUSED');
    assert.equal(session.variantState.latestEvaluation.reason, 'TOOL_CONTRACT_NOT_ACTIVE_OR_LEASED');

    await contractRevision({ db, session, revision: 1, status: 'ACTIVE' });
    const accepted = await controller.evaluatePersistentVariant(db, invocation(session, calls));
    assert.equal(calls.count, 1);
    assert.equal(accepted.receipt.result.executed, true);
    assert.equal(accepted.receipt.authorityProof.contractId, 'contract-1');
    assert.equal(accepted.receipt.authorityProof.contractRevision, 1);

    session = await store.getSession(db, opened.holobiontId);
    const authorized = await boundary.authorize(db, { session, state: session.variantState,
      runtimeInput: invocation(session, calls).runtimeInput });
    assert.equal(authorized.allowed, true);
    assert.equal(Object.isFrozen(authorized.runtimeInput.toolLease), true);
    assert.throws(() => { authorized.runtimeInput.toolLease.expiresAt = '2099-01-01T00:00:00.000Z'; }, TypeError);
    const beforeExpiredCall = calls.count;
    const realNow = Date.now;
    try {
      Date.now = () => Date.parse(authorized.runtimeInput.toolLease.expiresAt) + 1;
      assert.equal(authorized.runtimeInput.verifyLease(authorized.runtimeInput.toolLease), false);
      await assert.rejects(() => authorized.runtimeInput.execute({ a: 2 }),
        (error) => error.code === 'HOLOBIONT_TOOL_LEASE_EXPIRED');
    } finally { Date.now = realNow; }
    assert.equal(calls.count, beforeExpiredCall);

    const failing = invocation(session, calls);
    failing.runtimeInput.execute = async () => { calls.count += 1; throw new Error('remote outcome unknown'); };
    await assert.rejects(() => controller.evaluatePersistentVariant(db, failing), /remote outcome unknown/);
    session = await store.getSession(db, opened.holobiontId);
    assert.equal(session.variantState.latestEvaluation.status, 'UNKNOWN_EFFECT');
    assert.equal(calls.count, 2);

    const unverified = invocation(session, calls);
    unverified.verifyEvaluationEvidence = () => false;
    await assert.rejects(() => controller.evaluatePersistentVariant(db, unverified),
      (error) => error.code === 'HOLOBIONT_EVIDENCE_REQUIRED');
    session = await store.getSession(db, opened.holobiontId);
    assert.equal(session.variantState.latestEvaluation.status, 'UNVERIFIED');
    assert.equal(session.variantState.latestEvaluation.reason, 'HOLOBIONT_EVIDENCE_REQUIRED');
    assert.equal(calls.count, 3);

    await contractRevision({ db, session, revision: 2, status: 'REVOKED' });
    session = await store.getSession(db, opened.holobiontId);
    await assert.rejects(() => controller.evaluatePersistentVariant(db, invocation(session, calls)),
      (error) => error.code === 'HOLOBIONT_TOOL_OPERATION_REFUSED');
    assert.equal(calls.count, 3);
  } finally {
    await db.close();
  }
}

run().then(() => console.log('Holobiont persistent tool boundary: PASS'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
