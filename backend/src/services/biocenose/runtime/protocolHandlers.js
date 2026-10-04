'use strict';

const communityStore = require('../communityStore');
const commitment = require('../deliberation/commitmentService');
const claimsService = require('../claims/communityClaimGraph');
const reviewerRouter = require('../review/reviewerRouter');
const argumentsService = require('../argumentation/communityArgumentGraph');
const beliefRevision = require('../deliberation/beliefRevisionService');
const effectiveSize = require('../formation/effectiveCommunitySizeService');
const aggregationService = require('../question/communityAggregationService');
const dissentService = require('../dissent/dissentLedger');
const minorityVeto = require('../dissent/minorityEvidenceVetoService');
const judgmentService = require('../judgment/communityJudgmentService');
const judgmentStore = require('../judgment/judgmentStore');
const memberInvocation = require('./memberInvocationService');
const variantOrchestrator = require('./variantOrchestrator');
const DECISION_CHECKS = Object.freeze({
  EVIDENCE_SUPPORTED: (item) => item.verifiedClaimIds?.length > 0,
  EVIDENCE_WITH_DISSENT: (item) => item.verifiedClaimIds?.length > 0,
  PROBABILITY_ESTIMATE: (item) => item.estimates?.length > 0,
  PARETO_FRONT: (item) => item.options?.length > 0,
  DESIGN_OPTIONS_REVIEW: (item) => item.options?.length > 0,
  PLURALISM_PRESERVED: () => true,
  REPRESENTATIVE_DISTRIBUTION: (item) => item.representative?.panelCount > 0
    && item.representative?.distribution?.length > 0,
  CLAIM_MAP: claimMapReady,
  ARGUMENTS_ACCEPTED: (item) => item.argumentation?.labels?.length > 0
    && item.unresolvedClaimIds?.length === 0
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
  const persistent = context.variantPolicy?.name === 'persistent_community'
    ? await variantOrchestrator.persistentContext({ ...context, session, judgments: [] }) : null;
  if (persistent) await persistMembershipDecisions(context, session, persistent.report);
  const current = persistent ? await loadActiveSession(context) : session;
  const excluded = new Set(persistent?.report.excludedMemberIds || []);
  const participants = current.members.filter((member) => member.status === 'ACTIVE'
    && member.role !== 'community_facilitator' && !excluded.has(member.memberId));
  const commitments = await communityStore.listCommitments(context.db, session.communityId, session.round);
  const committed = new Set(commitments.map((item) => item.memberId));
  const quarantined = [];
  const delphi = context.variantPolicy?.name === 'delphi_community'
    ? await variantOrchestrator.delphiContext({ ...context, session }) : null;
  for (const member of participants.filter((item) => !committed.has(item.memberId))) {
    const judgment = await invokeMember(context, {
      member, phase: 'SEALED_JUDGMENT',
      task: delphi ? 'Review anonymous prior-round feedback. Revise or maintain your judgment with reasons and evidence.'
        : 'Form an independent initial judgment.',
      details: delphi ? { anonymousFeedback: delphi.feedback,
        priorPosition: delphi.previousByMember.get(member.memberId) } : {}
    });
    if (context.variantPolicy?.quarantineAware) {
      const result = await variantOrchestrator.quarantineIfRequired({ ...context, session, member, judgment });
      if (result) { quarantined.push(result); continue; }
    }
    await commitmentServiceCall(context, member, judgment);
  }
  const active = await loadActiveSession(context);
  const quorumReport = context.variantPolicy?.quarantineAware
    ? variantOrchestrator.assertByzantineQuorum({ ...context, session: active }) : null;
  const judgments = await commitment.revealJudgments({
    db: context.db, communityId: session.communityId, actorId: context.actorId
  });
  return { judgments, delphi: delphi ? {
    feedback: delphi.feedback,
    revisions: variantOrchestrator.delphiRevisions(delphi.previousByMember, judgments)
  } : undefined,
  byzantine: quorumReport ? { ...quorumReport, quarantined } : undefined,
  persistentCommunity: persistent?.report };
}
async function persistMembershipDecisions(context, session, report) {
  for (const item of report.members) {
    await communityStore.appendEvent(context.db, { communityId: session.communityId,
      actorId: context.actorId, type: 'MEMBERSHIP_DECISION_RECORDED',
      payload: { memberId: item.memberId, domain: item.domain, sampleCount: item.sampleCount,
        reputation: item.reputation, decayedReputation: item.decayedReputation,
        periodsElapsed: item.periodsElapsed, decision: item.decision, reason: item.reason,
        missionIndex: item.missionIndex }, patch: {} });
  }
  const rotated = new Set(report.rotation.rotate.map((item) => item.memberId));
  const expelled = new Set(report.excludedMemberIds.filter((memberId) => !rotated.has(memberId)));
  for (const [memberIds, type, reason] of [[rotated, 'MEMBER_ROTATED', 'ANTI_ENTRENCHMENT'],
    [expelled, 'MEMBER_EXPELLED', 'REPUTATION_BELOW_FLOOR']]) {
    for (const memberId of memberIds) {
      await communityStore.appendEvent(context.db, { communityId: session.communityId,
        actorId: context.actorId, type, payload: { memberId, reason }, patch: {} });
    }
  }
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
    const publicClaim = context.variantPolicy?.name === 'delphi_community'
      ? stripAttribution(claim) : stripOwner(claim);
    await collectClaimReviews({ context, session, claim: publicClaim, reviews });
    await verifyClaim({ context, session, claim: publicClaim, receipts: verificationReceipts });
  }
  return { reviews, verificationReceipts };
}

async function collectClaimReviews(input) {
  const { context, session, claim, reviews } = input;
  const route = reviewerRouter.route({ claim, members: session.members, policy: context.variantPolicy });
  if (route.requiredReviewerMissing) throw Object.assign(
    new Error('Adversarial Assembly requires at least one active adversarial reviewer.'),
    { code: 'BIOCENOSE_VARIANT_REVIEWER_REQUIRED' }
  );
  for (const reviewer of route.reviewers) {
    const member = findMember(session, reviewer.memberId);
    const review = await invokeMember(context, {
      member, phase: 'REVIEW', task: 'Review the assigned claim and return objections, arguments, and dissent as JSON.',
      details: { claim, specialties: reviewer.specialties, prompts: reviewer.prompts }
    });
    reviews.push({ claimId: claim.claimId, reviewerId: reviewer.memberId, review });
  }
}

async function verifyClaim(input) {
  return require('../verification/hybridOracleVerificationService').routeAndVerify(input);
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
      published.push({
        ...record, claimId: argument.claimId || item.claimId,
        createdBy: item.reviewerId, relation: argument.relation,
        argument: argument.argument || argument
      });
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
    const anonymous = context.variantPolicy?.name === 'delphi_community';
    const response = await invokeMember(context, {
      member, phase: 'REVISION', task: 'Revise only claims affected by evidence or arguments; return an empty changes list otherwise.',
      details: {
        initialJudgment: item.judgment,
        claims: anonymous ? claims.map(stripAttribution) : claims,
        reviews: anonymous ? undefined : reviews,
        arguments: anonymous ? argumentsList.map(anonymousArgument) : argumentsList,
        anonymousFeedback: anonymous ? anonymousFeedback(initial, reviews) : undefined
      }
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
  const active = session.members.filter((member) => member.status === 'ACTIVE'
    && member.role !== 'community_facilitator');
  const report = effectiveSize.effectiveCommunitySize(active);
  if (context.variantPolicy?.quarantineAware) {
    report.byzantine = variantOrchestrator.assertByzantineQuorum({ ...context, session: { ...session, members: active } });
  }
  return { report };
}

async function aggregateByQuestionType(context) {
  await movePhase(context, 'AGGREGATION');
  const session = await loadActiveSession(context);
  const judgments = prior(context, 0).judgments;
  const claims = prior(context, 1).claims;
  const reviewResult = prior(context, 2);
  const options = context.aggregationContext || {};
  if (context.variantPolicy?.name === 'polycentric_council' && !options.clusters?.length) {
    return variantOrchestrator.aggregatePolycentric({ context, session, claims,
      reviews: reviewResult.reviews, invokeMember });
  }
  const persistent = context.variantPolicy?.name === 'persistent_community'
    ? await variantOrchestrator.persistentContext({ ...context, session, judgments, suppliedForecasts: options.forecasts }) : null;
  const forecastContext = context.variantPolicy?.name === 'forecasting_crowd'
    ? await variantOrchestrator.forecastingContext({ db: context.db, session, judgments,
      suppliedForecasts: options.forecasts }) : null;
  const sourceForecasts = persistent?.forecasts || options.forecasts || judgments.flatMap((item) =>
    (item.judgment.probabilities || []).map((forecast) => ({ ...forecast, memberId: item.memberId })));
  const calibratedForecasts = forecastContext?.forecasts || sourceForecasts;
  const memberWeights = new Map(session.members.map((member) => [member.memberId, member.samplingWeight]));
  const forecasts = context.variantPolicy?.requireSamplingWeights
    ? calibratedForecasts.map((item) => ({ ...item, samplingWeight: item.samplingWeight ?? memberWeights.get(item.memberId) }))
    : calibratedForecasts;
  const history = context.variantPolicy?.name === 'persistent_community'
    ? await judgmentStore.listBeforeRound(context.db, session.communityId, session.round) : [];
  const aggregation = aggregationService.aggregate({
    ...options, questionType: session.questionType, claims, judgments,
    arguments: prior(context, 3).arguments,
    forecasts,
    verificationReceipts: reviewResult.verificationReceipts, variantPolicy: context.variantPolicy,
    isTrustedReceipt: context.isTrustedReceipt, history,
    members: session.members,
    quarantinedMemberIds: session.members.filter((member) => member.status === 'QUARANTINED')
      .map((member) => member.memberId)
  });
  const result = persistent ? { ...aggregation, persistentCommunity: persistent.report } : aggregation;
  if (!forecastContext) return result;
  const outcomes = Array.isArray(options.outcomes) ? options.outcomes : [];
  const forecastComparison = variantOrchestrator.scoreResolvedForecasts(forecasts, outcomes);
  const recordedCalibration = await variantOrchestrator.persistResolvedOutcomes({
    db: context.db, communityId: session.communityId, actorId: context.actorId,
    forecasts, outcomes, isTrustedReceipt: context.isTrustedReceipt
  });
  return { ...result, forecastCalibration: { members: forecastContext.weights,
    missingMemberIds: forecastContext.missingMemberIds, forecastComparison, recordedCalibration } };
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
  if (context.variantPolicy?.minimumRounds > context.session.round + 1) stopping.stableRoundCount = 0;
  if (aggregation.delphi?.relativeSpread > 0.25
    && context.session.round + 1 < (context.constitution?.roundLimit || 1)) stopping.stableRoundCount = 0;
  return judgmentService.finalize({
    db: context.db, communityId: context.communityId, actorId: context.actorId,
    aggregation, variantPolicy: context.variantPolicy,
    verificationReceipts: prior(context, 2).verificationReceipts,
    isTrustedReceipt: context.isTrustedReceipt,
    uncertainty: context.uncertainty ?? { independence: prior(context, 5).report }, stopping
  });
}

function anonymousFeedback(judgments, reviews) {
  const positions = new Map();
  for (const item of judgments) {
    const position = String(item.judgment.position ?? 'ABSTAIN');
    positions.set(position, (positions.get(position) || 0) + 1);
  }
  return {
    positionCounts: [...positions].map(([position, count]) => ({ position, count })),
    reviewSummaries: reviews.map((item) => ({ claimId: item.claimId, review: anonymousReview(item.review) }))
  };
}

function anonymousReview(review) {
  const allowed = ['summary', 'objections', 'evidenceRefs', 'counterexamples'];
  return Object.fromEntries(allowed.filter((key) => review?.[key] !== undefined)
    .map((key) => [key, review[key]]));
}

function anonymousArgument(item) {
  return { claimId: item.claimId, relation: item.relation, argument: item.argument };
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

function stripAttribution(claim) {
  const { createdBy, owners, ...value } = claim;
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
