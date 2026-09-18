'use strict';

const crypto = require('crypto');
const { getDatabase } = require('../db');
const { publishSignal } = require('./signalingTransportService');
const relational = require('./crossAgentRelationalService');

function decisionId() {
  return `decision_${crypto.randomUUID()}`;
}

function decisionValues(input, id) {
  return [id, input.topic, JSON.stringify(input.proposal || {}), Number(input.quorum) || 1,
    input.expiresAt || null, input.organizationId || null, input.projectId || null, input.createdBy || null];
}

function signalValues(input, id) {
  return {
    signalType: 'voltage', topic: input.topic, senderAgentId: input.createdBy,
    signalData: { decisionId: id, proposal: input.proposal || {}, quorum: Number(input.quorum) || 1 }, ttlMs: 60_000
  };
}

async function openDecision(input = {}) {
  const db = input.db || await getDatabase();
  const id = input.id || decisionId();
  await db.run(
    `INSERT INTO collective_decisions
      (id, topic, proposal_json, quorum, expires_at, organization_id, project_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    decisionValues(input, id)
  );
  await publishSignal(signalValues(input, id));
  return getDecision({ id, db });
}

async function castVote(input = {}) {
  const db = input.db || await getDatabase();
  const decision = await db.get('SELECT * FROM collective_decisions WHERE id = ?', input.decisionId);
  if (!decision || decision.status !== 'open') throw new Error('Decision is not open.');
  if (!['approve', 'reject', 'abstain'].includes(input.vote)) throw new Error('Unsupported decision vote.');
  await db.run(
    `INSERT OR REPLACE INTO collective_decision_votes
      (decision_id, voter_agent_id, vote, evidence_json) VALUES (?, ?, ?, ?)`,
    [input.decisionId, input.voterAgentId, input.vote, JSON.stringify(input.evidence || {})]
  );
  return resolveIfQuorum({ decisionId: input.decisionId, db });
}

async function resolveIfQuorum(input = {}) {
  const db = input.db || await getDatabase();
  const decision = await db.get('SELECT * FROM collective_decisions WHERE id = ?', input.decisionId);
  const votes = await db.all('SELECT * FROM collective_decision_votes WHERE decision_id = ?', input.decisionId);
  if (!decision || votes.length < decision.quorum) return decision ? formatDecision(decision, votes) : null;
  const approvals = votes.filter((vote) => vote.vote === 'approve').length;
  const status = approvals >= decision.quorum ? 'accepted' : 'rejected';
  const result = { approvals, votes: votes.length, quorum: decision.quorum };
  await db.run(
    `UPDATE collective_decisions SET status = ?, result_json = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [status, JSON.stringify(result), input.decisionId]
  );
  return formatDecision({ ...decision, status, result_json: JSON.stringify(result) }, votes);
}

async function getDecision(input = {}) {
  const db = input.db || await getDatabase();
  const decision = await db.get('SELECT * FROM collective_decisions WHERE id = ?', input.id);
  if (!decision) return null;
  const votes = await db.all('SELECT * FROM collective_decision_votes WHERE decision_id = ?', input.id);
  return formatDecision(decision, votes);
}

function formatDecision(decision, votes) {
  return {
    id: decision.id, topic: decision.topic, status: decision.status,
    proposal: JSON.parse(decision.proposal_json || '{}'),
    result: decision.result_json ? JSON.parse(decision.result_json) : null,
    votes: votes.map((vote) => ({ voterAgentId: vote.voter_agent_id, vote: vote.vote, evidence: JSON.parse(vote.evidence_json || '{}') })),
    quorum: decision.quorum, createdAt: decision.created_at, resolvedAt: decision.resolved_at
  };
}

async function relateVoter(input = {}) {
  return relational.createRelation({
    ...input, relationType: 'collaborator',
    metadata: { decisionId: input.decisionId, topic: input.topic }
  });
}

module.exports = { openDecision, castVote, resolveIfQuorum, getDecision, relateVoter };
