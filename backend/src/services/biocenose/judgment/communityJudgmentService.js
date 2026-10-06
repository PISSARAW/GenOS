'use strict';

const { randomUUID } = require('crypto');
const communityStore = require('../communityStore');
const judgmentStore = require('./judgmentStore');
const promotionGate = require('./promotionGateService');
const stoppingRule = require('./stoppingRuleService');
const { assertValidConstitution } = require('../governance/constitutionValidator');
const { constitutionHash } = require('../governance/protocolVersioning');
const variantPolicies = require('../variants/variantPolicyRouter');
const assessment = require('./outcomeAssessment');

async function finalize(input) {
  const session = await communityStore.loadSession(input.db, input.communityId);
  if (!session || session.phase !== 'AGGREGATION' || session.status !== 'ACTIVE') {
    throw Object.assign(new Error('Community must be active in aggregation before final judgment.'), { code: 'BIOCENOSE_JUDGMENT_PHASE_INVALID' });
  }
  const constitution = await communityStore.latestConstitution(input.db, input.communityId);
  if (!constitution) throw Object.assign(new Error('Community constitution is missing.'), { code: 'BIOCENOSE_CONSTITUTION_UNKNOWN' });
  validateActiveConstitution(constitution, session);
  const variantPolicy = variantPolicies.select(constitution.constitution.variant);
  const stopping = { ...input.stopping };
  if (variantPolicy.minimumRounds > session.round + 1) stopping.stableRoundCount = 0;
  const effectiveInput = { ...input, variantPolicy };
  const stop = stoppingRule.evaluate({ ...stopping, round: session.round, constitution: constitution.constitution });
  if (!stop.stop) return { finalized: false, status: 'IN_PROGRESS', stopReason: stop.reason };
  const persistedClaims = await communityStore.listClaims(input.db, input.communityId, session.round);
  const gates = await promotionGate.evaluate({ ...effectiveInput,
    persistedClaimIds: persistedClaims.map((item) => item.claimId) }, session, persistedClaims);
  const decision = judgmentRecord({ ...input, aggregation: gates.aggregation }, {
    stop, openCriticalDissent: gates.dissent.gates.filter((item) => item.promotion !== 'ALLOWED'),
    dissentGates: gates.dissent.gates, preservedDissentIds: gates.dissent.preservedIds,
    promotionGate: gates.gate, variantPolicy
  });
  const saved = await judgmentStore.record(input.db, {
    judgmentId: randomUUID(), communityId: input.communityId, round: session.round,
    actorId: input.actorId, judgment: decision,
    nextPhase: decision.status === 'DECIDED' ? 'DECIDED' : 'ESCALATED',
    nextStatus: decision.status === 'DECIDED' ? 'DECIDED' : 'ESCALATED', createdAt: new Date().toISOString()
  });
  return { finalized: true, ...saved };
}

function validateActiveConstitution(constitution, session) {
  assertValidConstitution(constitution);
  const identityMatches = constitution.communityId === session.communityId
    && constitution.constitutionId === session.constitutionId;
  if (identityMatches && constitutionHash(constitution.constitution) === constitution.constitutionHash) return;
  throw Object.assign(new Error('The active community constitution does not match its persisted identity and hash.'), {
    code: 'BIOCENOSE_CONSTITUTION_INTEGRITY_FAILED'
  });
}

function judgmentRecord(input, context) {
  const humanReview = assessment.needsHuman(input.aggregation);
  const unresolved = !assessment.ready(input.aggregation);
  const status = context.openCriticalDissent.length ? 'ESCALATED'
    : humanReview ? 'HUMAN_REVIEW_REQUIRED'
      : unresolved ? 'IRREDUCIBLE_DISAGREEMENT' : 'DECIDED';
  return {
    status, decisionOutcome: assessment.decisionOutcome({ aggregation: input.aggregation, status,
      dissentIds: context.preservedDissentIds, promotionGate: context.promotionGate,
      independence: input.uncertainty?.independence, stopReason: context.stop.reason }),
    questionType: input.aggregation.questionType, aggregation: input.aggregation,
    uncertainty: input.uncertainty ?? null, openCriticalDissentIds: context.openCriticalDissent.map((item) => item.dissentId),
    dissentGates: context.dissentGates, preservedDissentIds: context.preservedDissentIds,
    variant: context.variantPolicy.name, variantExecutionLevel: context.variantPolicy.executionLevel,
    promotionGate: context.promotionGate,
    stopReason: context.stop.reason
  };
}

module.exports = { finalize };
