'use strict';

const { randomUUID } = require('crypto');
const communityStore = require('../communityStore');
const dissentLedger = require('../dissent/dissentLedger');
const judgmentStore = require('./judgmentStore');
const stoppingRule = require('./stoppingRuleService');

async function finalize(input) {
  const session = await communityStore.loadSession(input.db, input.communityId);
  if (!session || session.phase !== 'AGGREGATION' || session.status !== 'ACTIVE') {
    throw Object.assign(new Error('Community must be active in aggregation before final judgment.'), { code: 'BIOCENOSE_JUDGMENT_PHASE_INVALID' });
  }
  const constitution = await communityStore.latestConstitution(input.db, input.communityId);
  if (!constitution) throw Object.assign(new Error('Community constitution is missing.'), { code: 'BIOCENOSE_CONSTITUTION_UNKNOWN' });
  const stop = stoppingRule.evaluate({ ...input.stopping, round: session.round, constitution: constitution.constitution });
  if (!stop.stop) return { finalized: false, status: 'IN_PROGRESS', stopReason: stop.reason };
  const openCriticalDissent = await criticalDissent(input.db, input.communityId);
  const decision = judgmentRecord(input, { stop, openCriticalDissent });
  const saved = await judgmentStore.record(input.db, {
    judgmentId: randomUUID(), communityId: input.communityId, round: session.round,
    actorId: input.actorId, judgment: decision,
    nextPhase: decision.status === 'DECIDED' ? 'DECIDED' : 'ESCALATED',
    nextStatus: decision.status === 'DECIDED' ? 'DECIDED' : 'ESCALATED', createdAt: new Date().toISOString()
  });
  return { finalized: true, ...saved };
}

async function criticalDissent(db, communityId) {
  const entries = await dissentLedger.list({ db, communityId });
  return entries.filter((entry) => ['OPEN', 'ESCALATED', 'VALIDATED'].includes(entry.status)
    && entry.dissent.severity >= 0.8 && entry.dissent.materiality >= 0.8);
}

function judgmentRecord(input, context) {
  const humanReview = input.aggregation.humanJudgmentRequired === true;
  const unresolved = ['UNRESOLVED', 'INSUFFICIENT_FORECASTS', 'NO_COMPARABLE_OPTIONS', 'REVIEW_REQUIRED']
    .includes(input.aggregation.outcome)
    || (input.aggregation.unresolvedClaimIds || []).length > 0;
  const status = context.openCriticalDissent.length ? 'ESCALATED'
    : humanReview ? 'HUMAN_REVIEW_REQUIRED'
      : unresolved ? 'IRREDUCIBLE_DISAGREEMENT' : 'DECIDED';
  return {
    status, questionType: input.aggregation.questionType, aggregation: input.aggregation,
    uncertainty: input.uncertainty ?? null, openCriticalDissentIds: context.openCriticalDissent.map((item) => item.dissentId),
    stopReason: context.stop.reason
  };
}

module.exports = { finalize };
