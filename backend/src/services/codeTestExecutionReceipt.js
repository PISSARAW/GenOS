'use strict';

const crypto = require('crypto');
const commandPolicy = require('./sandboxCommandPolicy');

const SCHEMA = 'genos.code-test-suite-receipt/v1';
const EVENT_TYPE = 'CODE_TEST_SUITE_RECEIPT';
const DIGEST_PATTERN = /^[a-f0-9]{64}$/i;

function normalizedProof(proof = {}) {
  return {
    command: String(proof.command || ''),
    executed: proof.executed === true,
    exitCode: Number.isInteger(proof.exitCode) ? proof.exitCode : null,
    digest: typeof proof.digest === 'string' ? proof.digest : null,
  };
}

function proofDigest(proofs) {
  return crypto.createHash('sha256').update(JSON.stringify(proofs)).digest('hex');
}

function isCompleteProof(proof) {
  return Boolean(proof.command) && typeof proof.executed === 'boolean';
}

function isTestCommand(command) {
  return commandPolicy.isAllowedSandboxTestCommand(command) && !/^echo(?:\s|$)/i.test(command);
}

function isPassingProof(proof) {
  return proof.executed && proof.exitCode === 0 && DIGEST_PATTERN.test(proof.digest || '')
    && isTestCommand(proof.command);
}

function suiteStatus(proofs) {
  const complete = proofs.length > 0 && proofs.every(isCompleteProof);
  return { complete, passed: complete && proofs.every(isPassingProof) };
}

function buildReceipt({ agentId, missionId, workspaceRoot, proofs }) {
  const normalized = (Array.isArray(proofs) ? proofs : []).map(normalizedProof);
  if (!normalized.length) return null;
  const { complete, passed } = suiteStatus(normalized);
  return {
    eventType: EVENT_TYPE,
    action: 'TEST_SUITE_EXECUTION',
    detail: passed ? 'Sandbox test suite completed successfully.' : 'Sandbox test suite did not pass.',
    payload: {
      schema: SCHEMA,
      source: 'local-codex-runtime',
      agentId: String(agentId || ''),
      missionId: String(missionId || ''),
      workspaceRoot: String(workspaceRoot || ''),
      suiteId: crypto.randomUUID(),
      complete,
      passed,
      proofs: normalized,
      suiteDigest: proofDigest(normalized),
    },
  };
}

function parsePayload(event) {
  try { return JSON.parse(event.payload_json || '{}'); } catch { return null; }
}

function hasReceiptIdentity(event, payload, missionId) {
  return event?.event_type === EVENT_TYPE && event.action === 'TEST_SUITE_EXECUTION'
    && Boolean(event.agent_id) && payload.agentId === event.agent_id
    && Boolean(payload.missionId) && (!missionId || payload.missionId === missionId);
}

function hasPassingEnvelope(payload) {
  return payload.schema === SCHEMA && payload.source === 'local-codex-runtime'
    && Boolean(payload.workspaceRoot) && Boolean(payload.suiteId)
    && payload.complete === true && payload.passed === true;
}

function hasValidProofs(payload) {
  if (!Array.isArray(payload.proofs) || payload.proofs.length === 0) return false;
  const proofs = payload.proofs.map(normalizedProof);
  return proofDigest(proofs) === payload.suiteDigest && proofs.every(isPassingProof);
}

function isPassingReceipt(event, missionId) {
  const payload = parsePayload(event);
  return Boolean(payload && hasReceiptIdentity(event, payload, missionId)
    && hasPassingEnvelope(payload) && hasValidProofs(payload));
}

function hasPassingSuite(events, missionId) {
  return (Array.isArray(events) ? events : []).some(event => isPassingReceipt(event, missionId));
}

module.exports = { SCHEMA, EVENT_TYPE, buildReceipt, isPassingReceipt, hasPassingSuite };
