'use strict';

const {
  sha256Prefixed,
  evaluateQualificationLevel
} = require('./sqlabPrimitives');
const {
  buildExecutionTrace,
  buildRawEvidenceVault,
  buildIndependentVerdicts,
  buildResourceMetrics
} = require('./sqlabSectionBuilders');

const OUTCOME_ENGLISH_ALIAS = Object.freeze({
  reussite: 'success',
  echec: 'failure',
  indetermine: 'indeterminate'
});

function countTransitionDrifts(primaryTransitions, replayTransitions) {
  const maxLen = Math.max(primaryTransitions.length, replayTransitions.length);
  let drifts = 0;
  for (let i = 0; i < maxLen; i += 1) {
    const p = primaryTransitions[i];
    const r = replayTransitions[i];
    const same = p && r && p.beforeStateHash === r.beforeStateHash && p.afterStateHash === r.afterStateHash;
    if (!same) drifts += 1;
  }
  return drifts;
}

function countVerdictDrifts(primaryVerdicts, replayVerdicts) {
  const maxLen = Math.max(primaryVerdicts.length, replayVerdicts.length);
  let drifts = 0;
  for (let i = 0; i < maxLen; i += 1) {
    const p = primaryVerdicts[i];
    const r = replayVerdicts[i];
    const same = p && r && p.outcome === r.outcome && p.passed === r.passed;
    if (!same) drifts += 1;
  }
  return drifts;
}

function materializeReplaySections(primarySections, replayOverride = {}) {
  const executionTrace = replayOverride.executionTrace
    ? buildExecutionTrace(replayOverride.executionTrace)
    : primarySections.executionTrace;
  const rawEvidenceVault = replayOverride.rawEvidence
    ? buildRawEvidenceVault(replayOverride.rawEvidence)
    : primarySections.rawEvidenceVault;
  const independentVerdicts = replayOverride.independentVerdicts
    ? buildIndependentVerdicts(replayOverride.independentVerdicts, rawEvidenceVault)
    : primarySections.independentVerdicts;
  const resourceMetrics = replayOverride.resourceMetrics
    ? buildResourceMetrics(replayOverride.resourceMetrics)
    : primarySections.resourceMetrics;
  return { executionTrace, rawEvidenceVault, independentVerdicts, resourceMetrics };
}

function collectDivergences(metrics) {
  const divergences = [];
  if (!metrics.evidenceDigestMatch) {
    divergences.push({ dimension: 'raw_evidence_digest', details: 'Replay evidence vault digest diverged from primary run.' });
  }
  if (metrics.stateTransitionDriftCount > 0) {
    divergences.push({ dimension: 'state_transitions', details: `${metrics.stateTransitionDriftCount} state transition(s) diverged.` });
  }
  if (metrics.verdictDriftCount > 0) {
    divergences.push({ dimension: 'independent_verdicts', details: `${metrics.verdictDriftCount} verdict(s) diverged on replay.` });
  }
  return Object.freeze(divergences);
}

function buildReplayAndDriftAnalysis(primarySections, replayOverride = {}) {
  const replay = materializeReplaySections(primarySections, replayOverride);
  const primaryRunDigest = sha256Prefixed({
    traceDigest: primarySections.executionTrace.traceDigest,
    vaultDigest: primarySections.rawEvidenceVault.vaultDigest,
    verdictsDigest: primarySections.independentVerdicts.verdictsDigest
  });
  const replayRunDigest = sha256Prefixed({
    traceDigest: replay.executionTrace.traceDigest,
    vaultDigest: replay.rawEvidenceVault.vaultDigest,
    verdictsDigest: replay.independentVerdicts.verdictsDigest
  });
  const evidenceDigestMatch = primarySections.rawEvidenceVault.vaultDigest === replay.rawEvidenceVault.vaultDigest;
  const stateTransitionDriftCount = countTransitionDrifts(
    primarySections.executionTrace.stateTransitions,
    replay.executionTrace.stateTransitions
  );
  const verdictDriftCount = countVerdictDrifts(
    primarySections.independentVerdicts.verdicts,
    replay.independentVerdicts.verdicts
  );
  const latencyDeltaMs = Math.abs(
    replay.resourceMetrics.wallTimeMs - primarySections.resourceMetrics.wallTimeMs
  );
  const divergences = collectDivergences({
    evidenceDigestMatch,
    stateTransitionDriftCount,
    verdictDriftCount
  });
  const body = {
    primaryRunDigest,
    replayRunDigest,
    evidenceDigestMatch,
    stateTransitionDriftCount,
    verdictDriftCount,
    latencyDeltaMs,
    divergences,
    reproducible: divergences.length === 0
  };
  return Object.freeze({ ...body, replayDigest: sha256Prefixed(body) });
}

function detectForbiddenConclusionViolation(missionSpec, agentConclusions = []) {
  const forbidden = missionSpec.expectedOutcome.forbiddenConclusions;
  const normalizedConclusions = agentConclusions.map((c) => String(c).toLowerCase());
  for (const banned of forbidden) {
    const token = String(banned).toLowerCase();
    if (normalizedConclusions.some((c) => c.includes(token))) {
      return banned;
    }
  }
  return null;
}

function resolveRawOutcomeClass(context) {
  if (context.violatedConclusion) {
    return { status: 'echec', reason: `Forbidden conclusion asserted: "${context.violatedConclusion}"` };
  }
  if (!context.independentVerdicts.allPassed) {
    return { status: 'echec', reason: 'One or more independent deterministic verifiers failed.' };
  }
  if (!context.replayAndDriftAnalysis.reproducible) {
    return { status: 'echec', reason: 'Replay drift detected across state transitions, evidence, or verdicts.' };
  }
  if (!context.resourceMetrics.budgetCompliance.withinBudget) {
    return { status: 'echec', reason: 'Resource consumption exceeded scenario budget limits.' };
  }
  const hasIndeterminateVerdict = context.independentVerdicts.verdicts.some((v) => v.outcome === 'indetermine');
  if (hasIndeterminateVerdict || context.rawEvidenceVault.hasDegradedSensor) {
    return { status: 'indetermine', reason: 'Degraded sensor visibility or irreducible evidence ambiguity precludes a definitive conclusion.' };
  }
  return { status: 'reussite', reason: 'All independent verifiers passed with reproducible replay and verified evidence.' };
}

function classifyScenarioOutcome(context) {
  const violatedConclusion = detectForbiddenConclusionViolation(
    context.missionSpec,
    context.agentConclusions ?? []
  );
  const outcomeResolution = resolveRawOutcomeClass({ ...context, violatedConclusion });
  const qualificationLevel = evaluateQualificationLevel({
    hasManifest: Boolean(context.environmentManifest?.manifestDigest),
    hasDeterministicVerdicts: Boolean(context.independentVerdicts?.allIndependentAndDeterministic),
    hasPersistentTrace: Boolean(context.executionTrace?.traceDigest && context.rawEvidenceVault?.vaultDigest),
    hasMultiComponentIntegration: (context.agentRoster?.principals?.length ?? 0) >= 2,
    hasReproducibleReplay: Boolean(context.replayAndDriftAnalysis?.reproducible),
    allIndependentVerdictsPassed: Boolean(context.independentVerdicts?.allPassed && !violatedConclusion),
    independentRealWindows: Number(context.longitudinalWindows ?? 0),
    realEnvironmentValidated: Boolean(context.realEnvironmentValidated)
  });
  const matchesExpectedClassification = outcomeResolution.status === context.missionSpec.expectedOutcome.expectedClassification;
  const body = {
    status: outcomeResolution.status,
    statusEn: OUTCOME_ENGLISH_ALIAS[outcomeResolution.status],
    matchesExpectedClassification,
    achievedQualificationLevel: qualificationLevel.code,
    achievedQualificationLabel: qualificationLevel.label,
    rationale: outcomeResolution.reason,
    nonClaims: Object.freeze(context.nonClaims ?? [
      'Local C4 qualification does not claim C5 longitudinal real-world durability without multi-window field observations.'
    ])
  };
  return Object.freeze({ ...body, classificationDigest: sha256Prefixed(body) });
}

module.exports = {
  buildReplayAndDriftAnalysis,
  classifyScenarioOutcome
};
