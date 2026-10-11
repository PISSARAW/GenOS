'use strict';

const crypto = require('node:crypto');

function requestFor(morphology, missionId, record) {
  if (!morphology || typeof morphology.topology !== 'string' || !morphology.topology.trim()) {
    throw new Error('Post-mission Rust adjudication requires a prepared topology');
  }
  return {
    schemaVersion: 1,
    currentTopology: morphology.topology,
    missionId: missionId || null,
    variantId: morphology.variantId || null,
    snapshotSha256: record.snapshotRef.snapshotSha256,
    graphId: record.snapshotRef.graphId,
    graphVersion: record.snapshotRef.graphVersion,
    reason: `post-mission persisted resolver proposals (verdict=${record.outcomeVerdict})`,
    proposals: record.proposals
  };
}

function verifyResponse(response, payload) {
  const digest = crypto.createHash('sha256').update(payload).digest('hex');
  if (!hasReadOnlyContract(response, digest)) {
    throw new Error('Invalid or unbound Rust morphogenesis adjudication response');
  }
  if (response.decision === 'NO_CHANGE' && response.plan.decision_no_change !== true) {
    throw new Error('Rust NO_CHANGE response has an inconsistent plan');
  }
  if (response.decision === 'REJECTED' && response.governance.allowed !== false) {
    throw new Error('Rust rejection response has inconsistent governance');
  }
  return response;
}

function hasReadOnlyContract(response, digest) {
  if (!response || response.schemaVersion !== 1 || response.requestSha256 !== digest) return false;
  if (!['NO_CHANGE', 'REJECTED'].includes(response.decision)) return false;
  if (response.commitAuthorized !== false || response.committed !== false) return false;
  if (!response.plan || typeof response.plan !== 'object') return false;
  return Boolean(response.governance && typeof response.governance.allowed === 'boolean');
}

async function adjudicatePostMission(morphology, options = {}) {
  if (!options.record?.snapshotRef || !Array.isArray(options.record.proposals)) {
    return { available: false, decision: 'UNAVAILABLE', committed: false,
      reason: 'PERSISTED_PROPOSALS_REQUIRED' };
  }
  const request = requestFor(morphology, options.missionId, options.record);
  const payload = JSON.stringify(request);
  const runner = options.runner || require('../../genosCli').runGenos;
  let result;
  try {
    result = await runner(['morphogenesis-adjudicate', payload], { timeoutMs: 10000 });
  } catch (error) {
    return { available: false, decision: 'UNAVAILABLE', committed: false,
      reason: error.code || 'RUST_ADJUDICATION_FAILED' };
  }
  if (!result?.ok) return {
    available: false, decision: 'UNAVAILABLE', committed: false,
    reason: result?.code || 'RUST_ADJUDICATION_FAILED'
  };
  return { available: true, ...verifyResponse(result.json, payload) };
}

module.exports = { adjudicatePostMission, requestFor, verifyResponse };
