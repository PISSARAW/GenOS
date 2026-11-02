'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { digest } = require('../../backend/src/services/evidenceProtocol/canonical');

const SCHEMA = 'genos.agow.paired-native-campaign/v1';
const CONDITIONS = ['shadow', 'bounded'];
const LIMITS = { costUsd: 1, deterministic: true, events: 100, latencyMs: 60000,
  tokens: 0, verification: { executions: 2, latencyMs: 30000 } };

function hash(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

function cases() {
  return [{ caseId: 'witness', values: [3, 5, 7], target: 10 },
    { caseId: 'enumeration-limit', values: Array(21).fill(1), target: 10 }];
}

function method(item) {
  return { version: 1, methodId: 'scoped_procedure', parameters: {
    procedure: { version: 1, methodId: 'subset_sum', parameters: {
      values: item.values, target: item.target } } } };
}

function mission(input) {
  return `Compute the paired subset sum ${input.caseId}/${input.condition} under campaign ${input.manifestHash}.`;
}

function schedule(items) {
  return items.flatMap((item, index) => {
    const conditions = index % 2 ? [...CONDITIONS].reverse() : CONDITIONS;
    return conditions.map((condition) => ({ caseId: item.caseId, condition }));
  });
}

function validateManifest(manifest) {
  assert.equal(manifest.schema, SCHEMA);
  assert.deepEqual(manifest.conditions, CONDITIONS);
  assert.deepEqual(manifest.limits, LIMITS);
  assert.deepEqual(manifest.schedule, schedule(manifest.cases));
  assert.ok(Number.isSafeInteger(manifest.createdAt) && manifest.createdAt > 0);
  assert.equal(manifest.promotionAllowed, false);
  assert.equal(manifest.holdout, false);
  assert.ok(manifest.cases.length > 0);
  assert.equal(new Set(manifest.cases.map((item) => item.caseId)).size, manifest.cases.length);
  for (const item of manifest.cases) validateCase(item);
  return manifest;
}

function validateCase(item) {
  assert.match(item.caseId, /^[a-z0-9-]+$/);
  assert.equal(item.methodHash, digest(method(item)));
  assert.match(item.initialDatabaseHash, /^[a-f0-9]{64}$/);
  assert.match(item.inputFileHash, /^[a-f0-9]{64}$/);
}

function validateArm(manifest, arm) {
  const item = manifest.cases.find((entry) => entry.caseId === arm.caseId);
  assert.ok(item, 'Unregistered case');
  assert.ok(CONDITIONS.includes(arm.condition), 'Unregistered condition');
  assert.equal(arm.manifestHash, digest(manifest));
  assert.equal(arm.initialDatabaseHash, item.initialDatabaseHash);
  assert.equal(arm.inputFileHash, item.inputFileHash);
  assert.equal(arm.methodHash, item.methodHash);
  assert.deepEqual(arm.limits, manifest.limits);
  assert.equal(arm.controlAuthority, arm.condition === 'bounded' ? 'agow' : 'historical');
  assert.ok(arm.startedAt >= manifest.createdAt, 'Manifest must precede the mission');
  validateLoss(arm);
}

function validateLoss(arm) {
  if (arm.loss === null) {
    assert.equal(arm.nativeRevalidated, false);
    return;
  }
  assert.ok(arm.loss === 0 || arm.loss === 1);
  assert.equal(arm.nativeRevalidated, true);
  assert.equal(arm.observationStatus, 'verified');
  assert.ok(arm.evidenceRefs.length > 0);
}

module.exports = { SCHEMA, CONDITIONS, LIMITS, hash, digest, cases, method, mission, schedule,
  validateManifest, validateArm };
