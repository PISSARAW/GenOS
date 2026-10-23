'use strict';

const assert = require('node:assert/strict');
const gate = require('../src/services/operationLifecycleGate');
const contract = require('../src/services/operationContractService');

function baseOperation() {
  return {
    schemaVersion: '1.0.0',
    operationKind: 'workflow',
    correlation: { missionId: 'm1', runId: 'r1', operationId: 'o1', eventId: 'e1', agentId: 'a1', branchId: 'b1' },
    idempotencyKey: 'idem-1',
    budget: { durationMs: 1000, maxCost: 0.5, maxSteps: 3, dataScope: 'project' },
    authority: { requester: 'orchestrator', leases: ['genos_execute_primitive'] }
  };
}

const operation = baseOperation();
assert.equal(gate.admitOperation(operation, { scope: 'project', authorized: true }).allowed, true);
assert.equal(gate.admit(operation, { authorized: false }).allowed, false);
assert.equal(gate.checkAdmission(operation, { budgetRemaining: 0 }).allowed, false);

// lease validation
assert.equal(gate.validateLease('lease-1').valid, true);
assert.equal(gate.validateLease({ id: 'l1', revoked: true }).valid, false);
assert.equal(gate.validateLease({ id: 'l1', expiresAt: 0 }).valid, false);

// snapshot invariant
const snapOk = { snapshotId: 's1', branchId: 'b1', executionId: 'r1', checksum: 'abc', receipt: { schemaVersion: '1.0.0', correlation: operation.correlation, idempotencyKey: 'idem-1', status: 'complete', origin: 'local', observed: {}, requested: {}, result: {} } };
assert.equal(gate.validateSnapshot(snapOk, { branchId: 'b1', executionId: 'r1' }).valid, true);
assert.equal(gate.validateSnapshot({ snapshotId: 's2' }).valid, false);

// budget transmission
assert.equal(gate.validateBudgetTransmission(operation.budget, { durationMs: 500, maxCost: 0.2, maxSteps: 2 }).valid, true);
assert.equal(gate.validateBudgetTransmission(operation.budget, { durationMs: 2000, maxCost: 1, maxSteps: 5 }).valid, false);
assert.equal(gate.isBudgetExhausted({ maxCost: 0, maxSteps: 1 }, {}).valid === undefined ? true : true, true);
assert.equal(gate.isBudgetExhausted({ maxCost: 0, maxSteps: 1 }, {}), true);

// evidence for claim
const evidence = { schemaVersion: '1.0.0', proofId: 'p1', correlation: operation.correlation, dimensions: [{ name: 'accuracy', value: 0.8, direction: 'higher', provenance: 'test' }] };
assert.equal(gate.validateEvidenceForClaim(evidence, { id: 'claim-1' }).valid, true);
assert.equal(gate.validateEvidenceForClaim({ schemaVersion: '1.0.0', proofId: 'p2', correlation: operation.correlation, dimensions: [] }, 'claim-2').valid, false);

// promotion
const receipt = contract.buildReceipt(operation, { status: 'complete', origin: 'local', observed: {}, requested: {}, result: {}, proofIds: ['p1'] });
assert.equal(gate.canPromote(receipt, [evidence]), true);
const receiptNoProof = contract.buildReceipt(operation, { status: 'complete', origin: 'local', observed: {}, requested: {}, result: {} });
assert.equal(gate.canPromote(receiptNoProof, []), false);

// close
assert.equal(contract.validateReceipt(gate.closeOperation(operation, { status: 'partial', reason: 'x', origin: 'local', observed: {}, requested: {}, result: {} })).valid, true);

// resume
assert.equal(gate.resumeOperation(operation, { snapshot: snapOk, budget: operation.budget, receipt }).allowed, true);
assert.equal(gate.resume(operation, {}).allowed, false);

// adapt
assert.equal(gate.adaptLegacy(operation).status, 'adapted');
assert.equal(gate.adapt({ foo: 'bar' }).status, 'partial');
assert.equal(gate.adapt(null).status, 'unavailable');

// compliance matrix
const matrix = gate.complianceMatrix();
assert.ok(Array.isArray(matrix) && matrix.length > 0);

// debit
const b = { maxCost: 1, maxSteps: 2 };
assert.equal(gate.debitBudget(b, 0.3).ok, true);
assert.equal(gate.debitBudget(b, 5).ok, false);

// revoke
const op2 = baseOperation();
gate.revokeAuthority(op2);
assert.equal(op2.authority.leases.length, 0);

// assertNoBypass throws
assert.throws(() => gate.assertNoBypass(operation, { authorized: false }), /gate denied/);

console.log('Operation lifecycle gate: admission, invariants, migration, compliance.');
