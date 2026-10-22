'use strict';

const {
  SQLAB_DOSSIER_SCHEMA,
  SQLAB_CAMPAIGN_SCHEMA,
  QUALIFICATION_LEVELS,
  SCENARIO_CATEGORIES,
  OUTCOME_CLASSES,
  sqlabFailure,
  sha256Prefixed,
  evaluateQualificationLevel
} = require('./sqlabPrimitives');
const {
  buildEnvironmentManifest,
  buildMissionSpec,
  buildAgentRoster,
  buildExecutionTrace,
  buildRawEvidenceVault,
  buildIndependentVerdicts,
  buildResourceMetrics
} = require('./sqlabSectionBuilders');
const {
  buildReplayAndDriftAnalysis,
  classifyScenarioOutcome
} = require('./sqlabReplayAndClassifier');
const {
  getReferenceQualificationCorpus
} = require('./sqlabCorpus');

const REQUIRED_DOSSIER_SECTIONS = Object.freeze([
  'environmentManifest',
  'missionSpec',
  'agentRoster',
  'executionTrace',
  'rawEvidenceVault',
  'independentVerdicts',
  'resourceMetrics',
  'replayAndDriftAnalysis',
  'finalClassification'
]);

function runScenarioQualification(scenarioSpec = {}) {
  const environmentManifest = buildEnvironmentManifest(scenarioSpec.environmentManifest);
  const missionSpec = buildMissionSpec(scenarioSpec.missionSpec);
  const agentRoster = buildAgentRoster(scenarioSpec.agentRoster);
  const executionTrace = buildExecutionTrace(scenarioSpec.executionTrace);
  const rawEvidenceVault = buildRawEvidenceVault(scenarioSpec.rawEvidence);
  const independentVerdicts = buildIndependentVerdicts(scenarioSpec.independentVerdicts, rawEvidenceVault);
  const resourceMetrics = buildResourceMetrics(scenarioSpec.resourceMetrics);
  const primarySections = {
    executionTrace,
    rawEvidenceVault,
    independentVerdicts,
    resourceMetrics
  };
  const replayAndDriftAnalysis = buildReplayAndDriftAnalysis(primarySections, scenarioSpec.replayOverride);
  const finalClassification = classifyScenarioOutcome({
    environmentManifest,
    missionSpec,
    agentRoster,
    executionTrace,
    rawEvidenceVault,
    independentVerdicts,
    resourceMetrics,
    replayAndDriftAnalysis,
    agentConclusions: scenarioSpec.agentConclusions,
    longitudinalWindows: scenarioSpec.longitudinalWindows,
    realEnvironmentValidated: scenarioSpec.realEnvironmentValidated,
    nonClaims: scenarioSpec.nonClaims
  });
  const body = {
    schema: SQLAB_DOSSIER_SCHEMA,
    scenarioId: missionSpec.scenarioId,
    category: missionSpec.category,
    environmentManifest,
    missionSpec,
    agentRoster,
    executionTrace,
    rawEvidenceVault,
    independentVerdicts,
    resourceMetrics,
    replayAndDriftAnalysis,
    finalClassification
  };
  return Object.freeze({ ...body, dossierDigest: sha256Prefixed(body) });
}

function checkMissingSections(dossier) {
  return REQUIRED_DOSSIER_SECTIONS.filter((key) => !dossier || typeof dossier[key] !== 'object' || dossier[key] === null);
}

function checkEvidenceDigests(rawEvidenceVault) {
  const artifacts = rawEvidenceVault?.artifacts ?? [];
  const corrupted = [];
  for (const art of artifacts) {
    const expected = sha256Prefixed(art.rawPayload);
    if (art.sha256 !== expected) {
      corrupted.push(art.artifactId);
    }
  }
  return corrupted;
}

function verifyQualificationDossier(dossier) {
  if (!dossier || typeof dossier !== 'object') {
    return { valid: false, errors: ['dossier_not_object'] };
  }
  const errors = [];
  if (dossier.schema !== SQLAB_DOSSIER_SCHEMA) {
    errors.push('invalid_schema');
  }
  const missingSections = checkMissingSections(dossier);
  if (missingSections.length > 0) {
    errors.push(`missing_sections:${missingSections.join(',')}`);
  }
  const corruptedArtifacts = checkEvidenceDigests(dossier.rawEvidenceVault);
  if (corruptedArtifacts.length > 0) {
    errors.push(`tampered_raw_evidence:${corruptedArtifacts.join(',')}`);
  }
  const { dossierDigest, ...bodyWithoutDigest } = dossier;
  const expectedDossierDigest = sha256Prefixed(bodyWithoutDigest);
  if (dossierDigest !== expectedDossierDigest) {
    errors.push('dossier_digest_mismatch');
  }
  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(errors),
    expectedDossierDigest
  });
}

function summarizeOutcomeCounts(dossiers) {
  const counts = { reussite: 0, echec: 0, indetermine: 0 };
  for (const d of dossiers) {
    const status = d.finalClassification.status;
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return Object.freeze(counts);
}

function checkCategoryCoverage(dossiers) {
  const present = new Set(dossiers.map((d) => d.category));
  const missingCategories = SCENARIO_CATEGORIES.filter((cat) => !present.has(cat));
  return Object.freeze({
    coveredCategories: Object.freeze(Array.from(present)),
    missingCategories: Object.freeze(missingCategories),
    completeCorpusCoverage: missingCategories.length === 0
  });
}

function runQualificationCampaign(scenarios = getReferenceQualificationCorpus()) {
  if (!Array.isArray(scenarios) || scenarios.length === 0) {
    throw sqlabFailure('SQLAB_CAMPAIGN_EMPTY', 'Qualification campaign requires at least one scenario.');
  }
  const dossiers = Object.freeze(scenarios.map(runScenarioQualification));
  const coverage = checkCategoryCoverage(dossiers);
  const outcomeCounts = summarizeOutcomeCounts(dossiers);
  const allMatchExpected = dossiers.every((d) => d.finalClassification.matchesExpectedClassification);
  const body = {
    schema: SQLAB_CAMPAIGN_SCHEMA,
    scenarioCount: dossiers.length,
    coverage,
    outcomeCounts,
    allMatchExpected,
    dossiers
  };
  return Object.freeze({ ...body, campaignDigest: sha256Prefixed(body) });
}

module.exports = {
  SQLAB_DOSSIER_SCHEMA,
  SQLAB_CAMPAIGN_SCHEMA,
  QUALIFICATION_LEVELS,
  SCENARIO_CATEGORIES,
  OUTCOME_CLASSES,
  REQUIRED_DOSSIER_SECTIONS,
  evaluateQualificationLevel,
  runScenarioQualification,
  verifyQualificationDossier,
  runQualificationCampaign,
  getReferenceQualificationCorpus
};
