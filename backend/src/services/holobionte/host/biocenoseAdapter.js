'use strict';

const { createHash } = require('crypto');
const store = require('../holobiontStore');
const hostGate = require('./hostDecisionGateService');

function decisionError(message, code = 'HOLOBIONT_BIOCENOSE_JUDGMENT_INVALID') {
  return Object.assign(new Error(message), { code });
}

function judgmentEvidence(judgment) {
  const aggregation = judgment.aggregation || {};
  const refs = Array.isArray(aggregation.evidenceRefs) ? aggregation.evidenceRefs : [];
  const normalized = [...new Set(refs.map((item) => String(item || '').trim()).filter(Boolean))];
  if (!normalized.length) throw decisionError('Biocenose judgment must carry evidence references.', 'HOLOBIONT_EVIDENCE_REQUIRED');
  return normalized;
}

async function loadJudgment(db, input) {
  const row = await db.get('SELECT judgment_id, community_id, round, judgment_json FROM biocenose_judgments WHERE judgment_id = ?', input.judgmentId);
  if (!row || row.community_id !== input.communityId) throw decisionError('Biocenose judgment not found for this community.');
  const judgment = JSON.parse(row.judgment_json);
  if (judgment.status !== 'DECIDED') throw decisionError('Only a settled Biocenose judgment can advise the Host.', 'HOLOBIONT_BIOCENOSE_JUDGMENT_UNSETTLED');
  return { row, judgment, evidenceRefs: judgmentEvidence(judgment) };
}

function judgmentHash(judgment) {
  return `sha256:${createHash('sha256').update(JSON.stringify(judgment)).digest('hex')}`;
}

async function authorizeWithJudgment(db, input = {}) {
  const session = await store.getSession(db, input.holobiontId);
  if (!session) throw decisionError('Holobiont session not found.', 'HOLOBIONT_SESSION_NOT_FOUND');
  if (Number(input.expectedSessionRevision) !== session.revision) {
    throw decisionError('Holobiont revision conflict.', 'HOLOBIONT_REVISION_CONFLICT');
  }
  const { row, judgment, evidenceRefs } = await loadJudgment(db, input);
  const authorization = await hostGate.authorizeHostDecision(db, {
    holobiontId: session.holobiontId, expectedSessionRevision: session.revision,
    requestedAuthority: 'HOST', changedInvariants: input.changedInvariants || [],
    decisionId: `biocenose:${row.judgment_id}`, claim: String(input.claim || 'Host decision informed by Biocenose judgment'),
    resultHash: judgmentHash(judgment), evidenceRefs, verifierId: input.verifierId,
    riskScore: input.riskScore, selfVerified: input.selfVerified === true,
    overrideReceipt: input.overrideReceipt
  });
  return {
    authorized: authorization.allowed, finalAuthority: 'HOST',
    advisory: { judgmentId: row.judgment_id, communityId: row.community_id, round: row.round,
      outcome: judgment.aggregation.outcome, position: judgment.aggregation.position || null, evidenceRefs },
    authorization
  };
}

module.exports = { authorizeWithJudgment };
