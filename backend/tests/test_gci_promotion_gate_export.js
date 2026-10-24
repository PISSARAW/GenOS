'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Ajv = require('ajv');
const descriptor = require('../../spec/gci/exports/promotion-gate-v1.json');
const { createCapabilityDescriptor } = require('../src/services/capabilityInheritance/catalog/capabilityDescriptor');
const { createExportRegistry } = require('../src/services/capabilityInheritance/catalog/exportRegistry');
const { getAllConcepts } = require('../src/services/capabilityGraphService');
const { accessFor } = require('../src/services/capabilityAccessMatrix');

function implementationDigest(files) {
  const digest = crypto.createHash('sha256');
  for (const file of [...files].sort()) {
    digest.update(file);
    digest.update('\0');
    digest.update(fs.readFileSync(path.resolve(__dirname, '..', '..', file)));
    digest.update('\0');
  }
  return `sha256:${digest.digest('hex')}`;
}

function assertAcceptanceContracts(exported) {
  const validateInput = new Ajv({ allErrors: true, strict: false }).compile(exported.inputContract);
  const validateOutput = new Ajv({ allErrors: true, strict: false }).compile(exported.outputContract);
  const validInput = { runId: 'run-1', signerId: 'reviewer', timestamp: Date.now(),
    signature: 'a'.repeat(64), humanApprovalReceipt: { approved: true, approvalId: 'approval-1',
      approverId: 'reviewer', approvedAt: new Date().toISOString(), payloadHash: 'b'.repeat(64) } };
  assert.equal(validateInput(validInput), true, JSON.stringify(validateInput.errors));
  assert.equal(validateInput({ ...validInput, unexpectedAuthority: 'all' }), false);
  assert.equal(validateOutput({ id: 'run-1', agentId: 'agent-1', contractId: 'contract-1',
    contractVersion: 1, status: 'completed', epistemicState: { verdict: 'executed', promotable: false } }), true);
  assert.equal(validateOutput({ id: 'run-1', agentId: 'agent-1', contractId: 'contract-1',
    contractVersion: 1, status: 'verified', epistemicState: { verdict: 'verified', promotable: true } }), false);
}

function main() {
  assert.equal(implementationDigest(descriptor.constraints.implementationFiles), descriptor.implementationDigest,
    'descriptor digest must identify the exact approval implementation');
  const validated = createCapabilityDescriptor(descriptor);
  const registry = createExportRegistry({ descriptors: [validated], capabilityGraph: getAllConcepts(), accessFor });
  const exported = registry.inspect('PROMOTION_GATE', '1.0.0');
  assert.equal(exported.maturity, 'integrated');
  assert.equal(exported.access.capability, 'PROMOTION_GATE');
  assert.ok(exported.access.tools.includes('genos_record_decision'));
  assert.ok(exported.access.tools.includes('genos_evaluate_trajectories'));
  assert.deepEqual(exported.requiredAuthority, ['workspace:write']);
  assert.equal(exported.constraints.http.path, '/api/execution-runs/{runId}/approve');
  assert.equal(exported.constraints.http.permission, 'workspace:write');
  assertAcceptanceContracts(exported);
  assert.equal(registry.inspect('PROMOTION_GATE', '2.0.0'), null);
  console.log('GCI PROMOTION_GATE export contract: ok');
}

try { main(); } catch (error) {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
}
