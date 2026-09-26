'use strict';

/**
 * @file biocenoseService.js
 * @description Biocenose compatibility facade for role composition,
 * candidate-option evaluation, and community calibration metrics.
 */

const topologyCapabilityService = require('./topologyCapabilityService');
const arenaTaskEvaluation = require('./arenaTaskEvaluation');
const epistemicBiocenose = require('./epistemic/epistemicBiocenoseService');
const hierarchicalQuorum = require('./hierarchicalQuorumService');
const communityStore = require('./biocenose/communityStore');
const judgmentCommitmentService = require('./biocenose/deliberation/commitmentService');
const communityClaimGraph = require('./biocenose/claims/communityClaimGraph');
const reviewerRouter = require('./biocenose/review/reviewerRouter');
const verifierRouter = require('./biocenose/verification/verifierRouter');
const communityArgumentGraph = require('./biocenose/argumentation/communityArgumentGraph');
const dissentLedger = require('./biocenose/dissent/dissentLedger');
const minorityEvidenceVeto = require('./biocenose/dissent/minorityEvidenceVetoService');
const beliefRevision = require('./biocenose/deliberation/beliefRevisionService');
const communityAggregation = require('./biocenose/question/communityAggregationService');
const calibration = require('./biocenose/calibration/calibrationService');
const communityJudgment = require('./biocenose/judgment/communityJudgmentService');
const adaptiveRecruitment = require('./biocenose/formation/adaptiveRecruitmentService');
const hierarchicalDeliberation = require('./biocenose/deliberation/hierarchicalDeliberationService');
const memberTrustBoundary = require('./biocenose/byzantine/memberTrustBoundaryService');
const maliciousSignalDetector = require('./biocenose/byzantine/maliciousSignalDetector');
const localEvidenceFilter = require('./biocenose/byzantine/localEvidenceFilter');
const quarantine = require('./biocenose/byzantine/quarantineService');
const variantPolicies = require('./biocenose/variants/variantPolicyRouter');
const biocenoseMorphogenesisAdapter = require('./biocenose/integration/biocenoseMorphogenesisAdapter');
const biocenoseRuntime = require('./biocenose/runtime/biocenoseRuntime');
const benchmarkMetrics = require('./biocenose/runtime/benchmarkMetrics');
const questionClassifier = require('./biocenose/question/questionClassifier');
const constitutionService = require('./biocenose/governance/constitutionService');
const communityFormationService = require('./biocenose/formation/communityFormationService');
const { effectiveCommunitySize } = require('./biocenose/formation/effectiveCommunitySizeService');

const NON_CANDIDATE_ROLES = new Set([
  'adversarial_reviewer', 'reviewer', 'consensus_observer', 'observer',
  'verifier', 'community_facilitator', 'aggregator', 'social_observer'
]);
const CANDIDATE_ROLES = new Set([
  'independent_solver', 'generator', 'candidate_solution', 'solution_candidate'
]);

function isCandidateOption(dossier) {
  const role = String(dossier?.role || '').trim().toLowerCase();
  if (NON_CANDIDATE_ROLES.has(role)) return false;
  return CANDIDATE_ROLES.has(role) || dossier?.candidateType === 'solution'
    || dossier?.candidateType === 'option' || dossier?.isCandidate === true;
}

function communityDiversity(dossiers) {
  const members = (Array.isArray(dossiers) ? dossiers : []).map((dossier) => ({
    ...dossier,
    type: dossier?.type || dossier?.role,
    errorPatterns: dossier?.errorPatterns || dossier?.errorClaims
  }));
  return members.length ? epistemicBiocenose.cognitiveBiocenose(members) : null;
}

function clamp01(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
}

function brierMember(dossier) {
  const events = Array.isArray(dossier?.events) ? dossier.events : [];
  const report = [...events].reverse().map((event) => event.evidenceReport).find(Boolean) || {};
  const claims = Array.isArray(report.claims) ? report.claims : [];
  const confidences = claims.map((claim) => Number(claim.confidence)).filter((value) => Number.isFinite(value));
  return {
    outcome: report.outcome,
    confidence: confidences.length ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length : clamp01(report.coverage)
  };
}

function oracleTruth(oracleResult) {
  if (oracleResult === 'success' || oracleResult === true) return 1;
  if (oracleResult === 'failed' || oracleResult === false) return 0;
  const num = Number(oracleResult);
  if (Number.isFinite(num)) return clamp01(num);
  return null;
}

function voteSupport(outcome) {
  return outcome === 'success' || outcome === true ? 1 : 0;
}

function brierScore(member, oracleResult) {
  const confidence = clamp01(member?.confidence ?? 0.5);
  const truth = oracleTruth(oracleResult);
  if (truth === null) return null;
  return (confidence - truth) ** 2;
}

function quorumWithAbstention(votes, options = {}) {
  const list = Array.isArray(votes) ? votes : [];
  const ratio = Number.isFinite(options.quorumRatio) ? options.quorumRatio : 0.5;
  let activeWeight = 0;
  let supportWeight = 0;
  let abstentions = 0;
  for (const vote of list) {
    if (vote?.abstain === true) { abstentions += 1; continue; }
    const weight = Number.isFinite(vote?.weight) && vote.weight > 0 ? vote.weight : 1;
    activeWeight += weight;
    if (vote?.support === true) supportWeight += weight;
  }
  const support = activeWeight > 0 ? supportWeight / activeWeight : 0;
  return { reached: support >= ratio, support: Number(support.toFixed(3)), quorumRatio: ratio, abstentions, activeVoters: list.length - abstentions };
}

function brierConsensus(dossiers, options = {}) {
  const members = (Array.isArray(dossiers) ? dossiers : []).map(brierMember);
  const truth = oracleTruth(options.oracleResult);
  const quorumRatio = Number.isFinite(options.quorumRatio) ? options.quorumRatio : 0.5;
  if (!members.length || truth === null) {
    return { reached: false, weightedSupport: 0, meanBrier: null, participantCount: members.length, quorumRatio, oracleMissing: true };
  }
  let weightSum = 0;
  let supportSum = 0;
  let brierSum = 0;
  for (const member of members) {
    const brier = brierScore(member, truth);
    if (brier === null) continue;
    const weight = Math.max(0, 1 - brier);
    const support = voteSupport(member.outcome);
    weightSum += weight;
    supportSum += weight * support;
    brierSum += brier;
  }
  const weightedSupport = weightSum > 0 ? supportSum / weightSum : 0;
  return {
    reached: weightedSupport >= quorumRatio,
    weightedSupport: Number(weightedSupport.toFixed(3)),
    meanBrier: Number((brierSum / members.length).toFixed(4)),
    quorumRatio,
    participantCount: members.length
  };
}

function candidateDossiers(dossiers) {
  return (Array.isArray(dossiers) ? dossiers : []).filter(isCandidateOption);
}

function evaluateCommunity(dossiers, options = {}) {
  const candidates = candidateDossiers(dossiers);
  const evaluation = arenaTaskEvaluation.evaluateDossiersPareto(candidates, options);
  const organization = options.organization || 'blind_adversarial_review';
  return {
    organization,
    arenaRecommendation: evaluation.leaderboard.length > 1 ? evaluation.kneePoint : null,
    candidateCount: candidates.length,
    leaderboard: evaluation.leaderboard,
    paretoFront: evaluation.paretoFront,
    diversity: communityDiversity(dossiers),
    independence: effectiveCommunitySize(dossiers),
    brier: brierConsensus(dossiers, options),
    capabilityContract: topologyCapabilityService.contractFor({ mode: 'biocenose', organization })
  };
}

function composeBiocenose(mission, options = {}) {
  const goal = String(mission || '').trim();
  if (!goal) {
    throw Object.assign(new Error('Biocenose mission is required.'), {
      code: 'BIOCENOSE_MISSION_REQUIRED'
    });
  }
  const formation = communityFormationService.formCommunity({
    mission: goal, population: options.population, candidates: options.memberCandidates
  });
  const organization = options.organization || 'blind_adversarial_review';
  return {
    mode: 'biocenose',
    mission: goal,
    evidenceThreshold: options.evidenceThreshold || 0.75,
    organization,
    capabilityContract: topologyCapabilityService.contractFor({ mode: 'biocenose', organization }),
    communicationPlan: hierarchicalQuorum.planForAgentCount(options.agentCount || 4, options),
    members: formation.members,
    formation: formation.metrics
  };
}

async function prepareCommunity({ db, orchestratorId, mission, options = {} }) {
  const composition = composeBiocenose(mission, options);
  const classification = questionClassifier.classifyQuestion(mission, { questionType: options.questionType });
  const session = await communityStore.createSession(db, {
    missionId: options.missionId,
    question: mission,
    questionType: classification.questionType,
    members: composition.members,
    actorId: orchestratorId
  });
  const constitution = await constitutionService.commitInitial({
    db, communityId: session.communityId, classification,
    roles: composition.members.map((member) => member.role),
    variant: options.variant,
    overrides: options.constitution, actorId: orchestratorId
  });
  if (composition.organization) {
    const dynamicOrganization = require('./dynamicOrganizationService');
    await dynamicOrganization.changeOrganization(db, {
      orchestratorId, organization: composition.organization,
      reason: 'Biocenose mode activation', changedBy: orchestratorId
    }).catch(() => {});
  }
  return {
    ...composition, communityId: session.communityId, sessionRevision: constitution.committed.sessionRevision,
    questionClassification: classification, constitutionId: constitution.committed.constitutionId,
    constitutionVersion: constitution.committed.version,
    variant: constitution.constitution.variant,
    variantSelection: constitution.variantSelection
  };
}

function activateBiocenose(mission, context = {}) {
  const composition = composeBiocenose(mission, context);
  return {
    activated: true,
    communityId: `biocenose-${Date.now()}`,
    ...composition,
    status: 'ACTIVE',
    activatedAt: new Date().toISOString()
  };
}

module.exports = {
  composeBiocenose,
  activateBiocenose,
  evaluateCommunity,
  prepareCommunity,
  commitJudgment: judgmentCommitmentService.commitJudgment,
  revealJudgments: judgmentCommitmentService.revealJudgments,
  publishClaim: communityClaimGraph.publish,
  listClaims: communityClaimGraph.list,
  routeClaimReview: reviewerRouter.route,
  routeClaimVerification: verifierRouter.route,
  publishArgument: communityArgumentGraph.publish,
  argumentGraphSnapshot: communityArgumentGraph.snapshot,
  recordDissent: dissentLedger.record,
  changeDissentStatus: dissentLedger.changeStatus,
  listDissent: dissentLedger.list,
  evaluateMinorityEvidenceVeto: minorityEvidenceVeto.evaluate,
  reviseBelief: beliefRevision.revise,
  aggregateCommunityJudgments: communityAggregation.aggregate,
  recordCalibrationOutcome: calibration.recordResolution,
  communityMemberReputation: calibration.reputation,
  finalizeCommunityJudgment: communityJudgment.finalize,
  recruitForDiversityGap: adaptiveRecruitment.recruit,
  aggregateHierarchicalDeliberation: hierarchicalDeliberation.aggregateAtParent,
  evaluateMemberTrust: memberTrustBoundary.evaluate,
  inspectMemberSignal: maliciousSignalDetector.inspect,
  filterLocalEvidence: localEvidenceFilter.filter,
  setMemberQuarantine: quarantine.setStatus,
  selectBiocenoseVariant: variantPolicies.select,
  recommendBiocenoseVariant: variantPolicies.recommend,
  recommendBiocenoseTransition: biocenoseMorphogenesisAdapter.recommend,
  runBiocenoseRound: biocenoseRuntime.runRound,
  summarizeBiocenoseBenchmark: benchmarkMetrics.summarize,
  brierConsensus,
  quorumWithAbstention,
  hierarchicalQuorumPlan: hierarchicalQuorum.planForAgentCount
};
