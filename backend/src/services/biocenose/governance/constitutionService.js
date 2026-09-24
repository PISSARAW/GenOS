'use strict';

const questionClassifier = require('../question/questionClassifier');
const { semanticsFor } = require('../question/decisionSemantics');
const { routeAggregationPolicy } = require('../question/aggregationPolicyRouter');
const { assertValidConstitution } = require('./constitutionValidator');
const protocolVersioning = require('./protocolVersioning');
const variantPolicies = require('../variants/variantPolicyRouter');

const EVIDENCE_STANDARDS = Object.freeze({
  FACTUAL: 'primary_sources_or_deterministic_verification',
  PROBABILISTIC: 'forecast_with_external_outcome_resolution',
  DESIGN: 'claims_assumptions_and_reproducible_tests',
  MULTI_CRITERIA: 'explicit_criteria_and_evidence_per_option',
  NORMATIVE: 'value_assumptions_and_preserved_dissent',
  EXPLORATORY: 'provenance_tagged_claim_map',
  MIXED: 'question_type_specific_evidence'
});

function buildConstitution(input) {
  const classification = input.classification || questionClassifier.classifyQuestion(input.question, {
    questionType: input.questionType
  });
  const semantics = semanticsFor(classification.questionType);
  const route = routeAggregationPolicy(classification.questionType);
  const variant = variantPolicies.select(input.variant || input.overrides?.variant);
  variantPolicies.assertCompatible(variant, classification.questionType);
  const base = defaultConstitution({ questionType: classification.questionType, roles: input.roles || [], semantics, route });
  const constitution = { ...base, ...(input.overrides || {}), questionType: classification.questionType, variant: variant.name };
  assertValidConstitution({
    constitutionId: 'draft', communityId: input.communityId, version: 1,
    constitution, constitutionHash: 'draft'
  });
  return { classification, semantics, route, constitution };
}

function defaultConstitution({ questionType, roles, semantics, route }) {
  return {
    questionType,
    evidenceStandard: EVIDENCE_STANDARDS[questionType],
    independenceRequirements: { sealedBeforeDisclosure: true, minimumDistinctProviders: 2 },
    roles: [...new Set(roles)],
    aggregationPolicy: route.policy,
    quorumPolicy: { minimumParticipationRatio: 0.5, supportThreshold: 0.5 },
    abstentionPolicy: { allowed: true, excludedFromSupportDenominator: true },
    dissentPolicy: { preserveMaterialMinority: true, requireDisposition: true },
    minorityEscalationPolicy: { verifiedCriticalEvidenceBlocksPromotion: true },
    roundLimit: 3,
    stoppingRule: { stableRounds: 1, stopWhenEvidenceValueIsLow: true },
    verificationPolicy: { deterministicVerifierPriority: true, evidenceFirst: route.evidenceFirst },
    escalationPolicy: { humanJudgmentRequired: semantics.humanJudgmentRequired, unresolvedCriticalDissent: true },
    decisionSemantics: semantics
  };
}

async function commitInitial(input) {
  const built = buildConstitution(input);
  const committed = await protocolVersioning.commitVersion({
    db: input.db, communityId: input.communityId, constitution: built.constitution,
    actorId: input.actorId, reason: input.reason
  });
  return { ...built, committed };
}

async function revise(input) {
  const latest = await protocolVersioning.loadVersion(input.db, input.constitutionId);
  if (!latest || latest.communityId !== input.communityId) {
    throw Object.assign(new Error('Constitution to revise was not found in this community.'), { code: 'BIOCENOSE_CONSTITUTION_UNKNOWN' });
  }
  const classification = { questionType: latest.constitution.questionType };
  const base = buildConstitution({
    communityId: input.communityId, question: input.question || '', classification,
    roles: latest.constitution.roles, overrides: { ...latest.constitution, ...(input.changes || {}) }
  });
  return protocolVersioning.commitVersion({
    db: input.db, communityId: input.communityId, constitution: base.constitution,
    actorId: input.actorId, reason: input.reason
  });
}

module.exports = { buildConstitution, commitInitial, revise };
