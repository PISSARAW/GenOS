'use strict';

const communityStore = require('../communityStore');
const commitment = require('../deliberation/commitmentService');
const claimsService = require('../claims/communityClaimGraph');
const reviewerRouter = require('../review/reviewerRouter');
const verifierRouter = require('../verification/verifierRouter');
const argumentsService = require('../argumentation/communityArgumentGraph');
const beliefRevision = require('../deliberation/beliefRevisionService');
const effectiveSize = require('../formation/effectiveCommunitySizeService');
const aggregationService = require('../question/communityAggregationService');
const dissentService = require('../dissent/dissentLedger');
const minorityVeto = require('../dissent/minorityEvidenceVetoService');
const judgmentService = require('../judgment/communityJudgmentService');
const memberInvocation = require('./memberInvocationService');
const DECISION_CHECKS = Object.freeze({
  EVIDENCE_SUPPORTED: (item) => item.verifiedClaimIds?.length > 0,
  EVIDENCE_WITH_DISSENT: (item) => item.verifiedClaimIds?.length > 0,
  PROBABILITY_ESTIMATE: (item) => item.estimates?.length > 0,
  PARETO_FRONT: (item) => item.options?.length > 0,
  DESIGN_OPTIONS_REVIEW: (item) => item.options?.length > 0,
  PLURALISM_PRESERVED: () => true,
  CLAIM_MAP: claimMapReady
});

const STEP_HANDLERS = Object.freeze({
  collect_sealed_judgments: collectSealedJudgments,
  build_claim_graph: buildClaimGraph,
  review_and_verify: reviewAndVerify,
  build_argument_graph: buildArgumentGraph,
  collect_belief_revisions: collectBeliefRevisions,
  check_independence: checkIndependence,
  aggregate_by_question_type: aggregateByQuestionType,
  check_dissent: checkDissent,
  record_community_judgment: recordCommunityJudgment
});

function createHandlers(options = {}) {
  return Object.fromEntries(Object.entries(STEP_HANDLERS).map(([step, handler]) => [
    step, (context) => handler({ ...options, ...context })
  ]));
}

async function collectSealedJudgments(context) {
  const session = await loadActiveSession(context);
  const participants = session.members.filter((member) => member.status === 'ACTIVE'
    && member.role !== 'community_facilitator');
  const commitments = await communityStore.listCommitments(context.db, session.communityId, session.round);
  const committed = new Set(commitments.map((item) => item.memberId));
  for (const member of participants.filter((item) => !committed.has(item.memberId))) {
    const judgment = await invokeMember(context, {
      member, phase: 'SEALED_JUDGMENT', task: 'Form an independent initial judgment.', details: {}
    });
    await commitmentServiceCall(context, member, judgment);
  }
  return { judgments: await commitment.revealJudgments({
    db: context.db, communityId: session.communityId, actorId: context.actorId
  }) };
}

async function commitmentServiceCall(context, member, response) {
  return commitment.commitJudgment({
    db: context.db, communityId: context.communityId, memberId: member.memberId,
    judgment: response.judgment || response
  });
}

async function buildClaimGraph(context) {
  const session = await loadActiveSession(context);
  const initial = prior(context, 0).judgments;
  for (const item of initial) {
    for (const claim of normalizeClaims(item.judgment.claims)) {
      await claimsService.publish({
        db: context.db, communityId: context.communityId, memberId: item.memberId, claim
      });
    }
  }
  return { claims: await claimsService.list({ db: context.db, communityId: session.communityId }) };
}

async function reviewAndVerify(context) {
  await movePhase(context, 'DELIBERATION');
  const session = await loadActiveSession(context);
  const claims = prior(context, 1).claims;
  const reviews = [];
  const verificationReceipts = [];
  for (const claim of claims) {
    const publicClaim = stripOwner(claim);
    const route = reviewerRouter.route({ claim: publicClaim, members: session.members });
    for (const reviewer of route.reviewers) {
      const member = findMember(session, reviewer.memberId);
      const review = await invokeMember(context, {
        member, phase: 'REVIEW', task: 'Review the assigned claim and return objections, arguments, and dissent as JSON.',
        details: { claim: publicClaim, specialties: reviewer.specialties, prompts: reviewer.prompts }
      });
      reviews.push({ claimId: claim.claimId, reviewerId: reviewer.memberId, review });
    }
    const verification = verifierRouter.route({ claim: publicClaim, members: session.members });
    if (verification.deterministicAvailable && typeof context.verificationExecutor === 'function') {
      for (const verifier of verification.verifiers) {
        const receipt = await context.verificationExecutor({ claim: publicClaim, verifier, communityId: session.communityId });
        if (receipt) verificationReceipts.push({ ...receipt, claimId: claim.claimId });
      }
    }
  }
  return { reviews, verificationReceipts };
}

async function buildArgumentGraph(context) {
  const reviews = prior(context, 2).reviews;
  const published = [];
  for (const item of reviews) {
    for (const argument of item.review.arguments || []) {
      const record = await argumentsService.publish({
        db: context.db, communityId: context.communityId, memberId: item.reviewerId,
        claimId: argument.claimId || item.claimId,
        relation: argument.relation, argument: argument.argument || argument
      });
      published.push(record);
    }
  }
  return { arguments: published };
}

async function collectBeliefRevisions(context) {
  await movePhase(context, 'REVISION');
  const session = await loadActiveSession(context);
  const initial = prior(context, 0).judgments;
  const claims = prior(context, 1).claims;
  const reviews = prior(context, 2).reviews;
  const argumentsList = prior(context, 3).arguments;
  const updates = [];
  for (const item of initial) {
    const member = findMember(session, item.memberId);
    const response = await invokeMember(context, {
      member, phase: 'REVISION', task: 'Revise only claims affected by evidence or arguments; return an empty changes list otherwise.',
      details: { initialJudgment: item.judgment, claims, reviews, arguments: argumentsList }
    });
    if (!response.changedClaims?.length) continue;
    updates.push(await beliefRevision.revise({
      db: context.db, communityId: session.communityId, memberId: member.memberId,
      previousPosition: response.previousPosition || String(item.judgment.position),
      newPosition: response.newPosition, changedClaims: response.changedClaims,
      reasonCodes: response.reasonCodes, evidenceRefs: response.evidenceRefs || [],
      criticalClaims: context.criticalClaims || []
    }));
  }
  return { updates };
}

async function checkIndependence(context) {
  const session = await loadActiveSession(context);
  return { report: effectiveSize.effectiveCommunitySize(session.members) };
}

async function aggregateByQuestionType(context) {
  await movePhase(context, 'AGGREGATION');
  const session = await loadActiveSession(context);
  const judgments = prior(context, 0).judgments;
  const claims = prior(context, 1).claims;
  const reviewResult = prior(context, 2);
  const options = context.aggregationContext || {};
  return aggregationService.aggregate({
    ...options, questionType: session.questionType, claims, judgments,
    forecasts: options.forecasts || judgments.flatMap((item) => item.judgment.probabilities || []),
    verificationReceipts: reviewResult.verificationReceipts
  });
}

async function checkDissent(context) {
  const session = await loadActiveSession(context);
  const reviews = prior(context, 2).reviews;
  for (const item of reviews) {
    for (const dissent of dissentItems(item.review.dissent)) {
      if (!Number.isFinite(dissent.materiality) || !Number.isFinite(dissent.severity)) continue;
      await dissentService.record({
        db: context.db, communityId: session.communityId, actorId: item.reviewerId,
        dissent: {
          ...dissent, claimRefs: dissent.claimRefs?.length ? dissent.claimRefs : [item.claimId],
          supportingMembers: dissent.supportingMembers?.length ? dissent.supportingMembers : [item.reviewerId],
          evidenceRefs: dissent.evidenceRefs || []
        }
      });
    }
  }
  const entries = await dissentService.list({ db: context.db, communityId: session.communityId });
  const receipts = prior(context, 2).verificationReceipts;
  const gates = entries.map((dissent) => minorityVeto.evaluate({
    dissent, receipts, isTrustedReceipt: context.isTrustedReceipt
  }));
  return { entries, gates };
}

async function recordCommunityJudgment(context) {
  const aggregation = prior(context, 6);
  const dissent = prior(context, 7);
  const openGate = dissent.gates.some((item) => item.promotion !== 'ALLOWED');
  const stopping = {
    ...(context.stopping || {}),
    stableRoundCount: context.stopping?.stableRoundCount ?? (decisionReady(aggregation) || openGate ? 1 : 0)
  };
  return judgmentService.finalize({
    db: context.db, communityId: context.communityId, actorId: context.actorId,
    aggregation, uncertainty: context.uncertainty ?? { independence: prior(context, 5).report }, stopping
  });
}

function decisionReady(aggregation) {
  if (aggregation.humanJudgmentRequired) return true;
  if ((aggregation.unresolvedClaimIds || []).length) return false;
  const check = DECISION_CHECKS[aggregation.outcome];
  return check ? Boolean(check(aggregation)) : false;
}

function claimMapReady(aggregation) {
  return aggregation.claims?.length > 0 && !aggregation.openQuestions?.length;
}

async function invokeMember(context, request) {
  const member = request.member;
  if (!member) throw Object.assign(new Error('A routed Biocenose member is unavailable.'), { code: 'BIOCENOSE_MEMBER_UNKNOWN' });
  return memberInvocation.invoke({
    ...request, db: context.db, memberInvoker: context.memberInvoker,
    timeoutMs: context.timeoutMs, maxTokens: context.maxTokens,
    session: await loadActiveSession(context), constitution: context.constitution
  });
}

function normalizeClaims(values) {
  return (Array.isArray(values) ? values : []).map((value) => typeof value === 'string' ? { statement: value } : value)
    .filter((value) => value && (value.statement || value.text));
}

function stripOwner(claim) {
  const { createdBy, ...value } = claim;
  return value;
}

function findMember(session, memberId) {
  return session.members.find((member) => member.memberId === memberId);
}

function dissentItems(value) {
  if (Array.isArray(value)) return value;
  return value && typeof value === 'object' ? [value] : [];
}

function prior(context, index) {
  return context.priorResults[index] || {};
}

async function loadActiveSession(context) {
  const session = await communityStore.loadSession(context.db, context.communityId);
  if (!session || session.status !== 'ACTIVE') throw Object.assign(
    new Error('Active Biocenose session required.'), { code: 'BIOCENOSE_RUNTIME_SESSION_INVALID' }
  );
  return session;
}

async function movePhase(context, phase) {
  const session = await loadActiveSession(context);
  if (session.phase === phase) return session;
  return communityStore.appendEvent(context.db, {
    communityId: context.communityId, actorId: context.actorId,
    type: 'PHASE_CHANGED', payload: { from: session.phase, to: phase }, patch: { phase }
  });
}

module.exports = { createHandlers };
