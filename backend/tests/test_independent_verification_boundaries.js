'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const { validateClaimContract } = require('../src/services/epistemic/claimVerificationContract');
const { evaluateVerifierIndependence } = require('../src/services/epistemic/verifierRuntimeBridge');

function testTautologyAndNoopRejection() {
  // 1. Unconditional no-op commands must be rejected
  const trueClaim = {
    statement: 'true exits with code 0',
    test: { command: 'true' }
  };
  const resTrue = validateClaimContract(trueClaim);
  assert.equal(resTrue.valid, false, 'true command must be rejected as no-op');
  assert.match(resTrue.reason, /no-op and tautological/i);

  const exitZeroClaim = {
    statement: 'exit 0 exits with code 0',
    test: { command: 'exit 0' }
  };
  const resExit = validateClaimContract(exitZeroClaim);
  assert.equal(resExit.valid, false, 'exit 0 must be rejected as no-op');

  const nodeEmptyClaim = {
    statement: 'node -e "" exits with code 0',
    test: { command: 'node -e ""' }
  };
  const resNode = validateClaimContract(nodeEmptyClaim);
  assert.equal(resNode.valid, false, 'node -e "" must be rejected as no-op');

  // 2. Real non-trivial test commands must pass contract validation
  const validClaim = {
    statement: 'npm test exits with code 0',
    test: { command: 'npm test' }
  };
  const resValid = validateClaimContract(validClaim);
  assert.equal(resValid.valid, true, 'npm test must be accepted as valid test contract');
}

function testProducerWorkspaceIndependence() {
  const producerWs = path.join(os.tmpdir(), 'producer-workspace');
  const replicaWs = path.join(os.tmpdir(), 'independent-replica-workspace');

  const antigen = {
    id: 'claim-auth-1',
    claim: 'Authentic check',
    workspaceRoot: producerWs,
    producer: {
      actorId: 'worker-producer-42',
      model: 'worker',
      version: '1.0',
      workspaceRoot: producerWs
    }
  };

  // 1. Verifier attempting to execute in the producer's dirty workspace
  const dependentVerifier = {
    type: 'test',
    actorId: 'verifier-agent-99',
    strategy: ['unit'],
    executionWorkspace: producerWs
  };
  const depResult = evaluateVerifierIndependence(dependentVerifier, antigen, []);
  assert.equal(depResult.independent, false, 'Verifier in producer workspace must be marked dependent');
  assert.equal(depResult.reason, 'insufficient_independence');

  // 2. Verifier executing in a separate replica workspace
  const independentVerifier = {
    type: 'test',
    actorId: 'verifier-agent-99',
    strategy: ['unit'],
    executionWorkspace: replicaWs
  };
  const indResult = evaluateVerifierIndependence(independentVerifier, antigen, []);
  assert.equal(indResult.independent, true, 'Verifier in separate replica workspace must be independent');
}

function main() {
  testTautologyAndNoopRejection();
  testProducerWorkspaceIndependence();
  console.log('Independent verification boundaries tests passed successfully.');
}

main();
