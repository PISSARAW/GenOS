'use strict';

const { withTransaction } = require('../../db');
const store = require('./storage');
const ledger = require('./ledger');
const incarnations = require('./incarnations');

async function selfModel(db, input) {
  await ledger.ensure(db, input);
  const rows = await db.all(`SELECT domain, COUNT(outcome) AS observations, SUM(outcome) AS successes,
    AVG((prediction - outcome) * (prediction - outcome)) AS brier
    FROM agent_identity_decisions WHERE agent_id = ? AND attribution = 'self'
    GROUP BY domain ORDER BY domain`, input.agentId);
  return { agentId: input.agentId, capabilities: rows.map(row => ({ domain: row.domain,
    observations: row.observations, successProbability: row.observations ? (row.successes + 1) / (row.observations + 2) : null,
    brier: row.brier })), source: 'runtime_attested_outcomes' };
}

async function begin(db, input) {
  return withTransaction(db, async () => {
    const head = await incarnations.assertSession(db, input.session);
    const requestHash = requestDigest(input);
    const existing = await db.get('SELECT * FROM agent_identity_decisions WHERE decision_id = ?', input.operationId);
    if (existing) {
      if (existing.request_hash !== requestHash) store.fail('IDENTITY_DECISION_CONFLICT');
      return existing;
    }
    const model = await selfModel(db, { agentId: input.session.agentId });
    const calibration = model.capabilities.find(item => item.domain === input.domain);
    const peer = await peerHead(db, { ...input, head });
    await recordEvent(db, { input, head, calibration, peer });
    const current = await store.head(db, head.agent_id);
    await db.run(`INSERT INTO agent_identity_decisions
      (decision_id, agent_id, incarnation_id, fencing_token, self_head, peer_id, peer_head,
      domain, prediction, dimensions_json, request_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    input.operationId, head.agent_id, head.incarnation_id, head.fencing_token, current.head_hash,
    input.peerId || null, peer?.head_hash || null, input.domain, calibration?.successProbability ?? null,
    JSON.stringify(input.dimensions || []), requestHash);
    return db.get('SELECT * FROM agent_identity_decisions WHERE decision_id = ?', input.operationId);
  });
}

function requestDigest(input) {
  return store.hash({ agentId: input.session.agentId, domain: input.domain,
    operationId: input.operationId, peerId: input.peerId || null, dimensions: input.dimensions || [] });
}

async function recordEvent(db, context) {
  const { input, head, calibration, peer } = context;
  await ledger.append(db, { agentId: head.agent_id, expectedRevision: head.revision,
    type: 'DECIDE', operationId: `decision:${input.operationId}`, payload: { domain: input.domain,
      prediction: calibration?.successProbability ?? null, peerId: input.peerId || null,
      dimensions: input.dimensions || [] }, causalRefs: peer ? [peer.head_hash] : [] });
}

async function peerHead(db, input) {
  if (!input.peerId) return null;
  const known = await db.get(`SELECT value_json FROM agent_identity_peer_claims
    WHERE observer_id = ? AND peer_id = ? AND claim_key = 'identity' AND source_kind = 'registry'`,
  input.session.agentId, input.peerId);
  if (!known) store.fail('IDENTITY_PEER_UNRECOGNIZED');
  const presentation = JSON.parse(known.value_json);
  const peer = await store.head(db, input.peerId);
  if (!peer || presentation.expiresAt <= Date.now() || presentation.headHash !== peer.head_hash) {
    store.fail('IDENTITY_PEER_STALE');
  }
  return peer;
}

async function finish(db, input) {
  return withTransaction(db, async () => {
    const head = await incarnations.assertSession(db, input.session);
    const decision = await db.get('SELECT * FROM agent_identity_decisions WHERE decision_id = ?', input.operationId);
    if (!decision || decision.agent_id !== head.agent_id || decision.incarnation_id !== head.incarnation_id
      || decision.fencing_token !== head.fencing_token) store.fail('IDENTITY_DECISION_OWNER_MISMATCH');
    if (!['self', 'peer', 'joint', 'unknown'].includes(input.attribution)) store.fail('IDENTITY_ATTRIBUTION_REQUIRED');
    if (typeof input.success !== 'boolean' || !input.evidenceRef) store.fail('IDENTITY_OUTCOME_EVIDENCE_REQUIRED');
    const result = { success: input.success, attribution: input.attribution, evidenceRef: input.evidenceRef };
    if (decision.result_json) {
      if (store.hash(JSON.parse(decision.result_json)) !== store.hash(result)) store.fail('IDENTITY_OUTCOME_CONFLICT');
      return JSON.parse(decision.result_json);
    }
    await ledger.append(db, { agentId: head.agent_id, expectedRevision: head.revision,
      type: 'OUTCOME', operationId: `outcome:${input.operationId}`, payload: result });
    await db.run(`UPDATE agent_identity_decisions SET outcome = ?, attribution = ?, result_json = ?
      WHERE decision_id = ?`, Number(input.success), input.attribution, JSON.stringify(result), input.operationId);
    return result;
  });
}

module.exports = { selfModel, begin, finish };
