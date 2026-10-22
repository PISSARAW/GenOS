'use strict';

const {
  QUALIFICATION_LEVELS,
  SCENARIO_CATEGORIES,
  OUTCOME_CLASSES,
  sqlabFailure,
  requiredString,
  sha256Prefixed
} = require('./sqlabPrimitives');

function normalizeModelDescriptor(model = {}) {
  return Object.freeze({
    modelId: requiredString(model.modelId, 'SQLAB_MODEL_ID_REQUIRED', 128),
    provider: requiredString(model.provider ?? 'local-deterministic', 'SQLAB_MODEL_PROVIDER_REQUIRED', 128),
    weightsDigest: requiredString(model.weightsDigest ?? sha256Prefixed(model.modelId), 'SQLAB_MODEL_DIGEST_REQUIRED', 128),
    temperature: Number.isFinite(model.temperature) ? Number(model.temperature) : 0,
    seed: Number.isFinite(model.seed) ? Number(model.seed) : 42
  });
}

function buildEnvironmentManifest(spec = {}) {
  const commitSha = requiredString(spec.commitSha, 'SQLAB_COMMIT_SHA_REQUIRED', 64);
  if (!Array.isArray(spec.models) || spec.models.length === 0) {
    throw sqlabFailure('SQLAB_MODELS_REQUIRED', 'Environment manifest requires at least one model descriptor.');
  }
  const models = Object.freeze(spec.models.map(normalizeModelDescriptor));
  const environment = Object.freeze({
    os: requiredString(spec.environment?.os ?? process.platform, 'SQLAB_ENV_OS_REQUIRED', 64),
    nodeVersion: requiredString(spec.environment?.nodeVersion ?? process.version, 'SQLAB_ENV_NODE_REQUIRED', 64),
    rustToolchain: requiredString(spec.environment?.rustToolchain ?? '1.88.0-stable', 'SQLAB_ENV_RUST_REQUIRED', 64),
    isolationMode: requiredString(spec.environment?.isolationMode ?? 'sandboxed-worktree', 'SQLAB_ENV_ISOLATION_REQUIRED', 64),
    clockMode: requiredString(spec.environment?.clockMode ?? 'deterministic-b-series', 'SQLAB_ENV_CLOCK_REQUIRED', 64)
  });
  const body = {
    commitSha,
    branch: requiredString(spec.branch ?? 'v3', 'SQLAB_BRANCH_REQUIRED', 128),
    dirtyWorktree: Boolean(spec.dirtyWorktree),
    models,
    environment
  };
  return Object.freeze({ ...body, manifestDigest: sha256Prefixed(body) });
}

function buildMissionSpec(spec = {}) {
  const scenarioId = requiredString(spec.scenarioId, 'SQLAB_SCENARIO_ID_REQUIRED', 128);
  const category = requiredString(spec.category, 'SQLAB_CATEGORY_REQUIRED', 64);
  if (!SCENARIO_CATEGORIES.includes(category)) {
    throw sqlabFailure('SQLAB_CATEGORY_INVALID', `Unsupported scenario category: ${category}`);
  }
  const expectedClassification = requiredString(
    spec.expectedOutcome?.expectedClassification,
    'SQLAB_EXPECTED_CLASSIFICATION_REQUIRED',
    32
  );
  if (!OUTCOME_CLASSES.includes(expectedClassification)) {
    throw sqlabFailure('SQLAB_EXPECTED_CLASSIFICATION_INVALID', `Invalid outcome class: ${expectedClassification}`);
  }
  const targetLevelCode = spec.targetQualificationLevel ?? 'C4';
  if (!QUALIFICATION_LEVELS[targetLevelCode]) {
    throw sqlabFailure('SQLAB_QUALIFICATION_LEVEL_INVALID', `Unknown qualification level: ${targetLevelCode}`);
  }
  const body = {
    scenarioId,
    category,
    title: requiredString(spec.title, 'SQLAB_TITLE_REQUIRED', 256),
    missionDescription: requiredString(spec.missionDescription, 'SQLAB_MISSION_DESC_REQUIRED', 2048),
    targetQualificationLevel: targetLevelCode,
    expectedOutcome: Object.freeze({
      expectedClassification,
      expectedFindings: Object.freeze(Array.isArray(spec.expectedOutcome?.expectedFindings) ? spec.expectedOutcome.expectedFindings.slice() : []),
      forbiddenConclusions: Object.freeze(Array.isArray(spec.expectedOutcome?.forbiddenConclusions) ? spec.expectedOutcome.forbiddenConclusions.slice() : []),
      requiresAbstentionOrEscalation: Boolean(spec.expectedOutcome?.requiresAbstentionOrEscalation)
    })
  };
  return Object.freeze({ ...body, missionDigest: sha256Prefixed(body) });
}

function normalizePermissionEntry(permission = {}) {
  const durationMs = Number(permission.durationMs);
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw sqlabFailure('SQLAB_PERMISSION_DURATION_INVALID', 'Permission durationMs must be positive.');
  }
  return Object.freeze({
    target: requiredString(permission.target, 'SQLAB_PERMISSION_TARGET_REQUIRED', 256),
    operation: requiredString(permission.operation, 'SQLAB_PERMISSION_OP_REQUIRED', 128),
    durationMs,
    grantId: requiredString(permission.grantId ?? `grant:${permission.target}:${permission.operation}`, 'SQLAB_GRANT_ID_REQUIRED', 128)
  });
}

function normalizeRosterEntry(entry = {}) {
  const permissions = Array.isArray(entry.permissions)
    ? entry.permissions.map(normalizePermissionEntry)
    : [];
  return Object.freeze({
    id: requiredString(entry.id, 'SQLAB_AGENT_ID_REQUIRED', 128),
    kind: requiredString(entry.kind ?? 'agent', 'SQLAB_AGENT_KIND_REQUIRED', 32),
    role: requiredString(entry.role, 'SQLAB_AGENT_ROLE_REQUIRED', 128),
    permissions: Object.freeze(permissions)
  });
}

function buildAgentRoster(agentsSpec = []) {
  if (!Array.isArray(agentsSpec) || agentsSpec.length === 0) {
    throw sqlabFailure('SQLAB_ROSTER_REQUIRED', 'Scenario must declare at least one principal in agentRoster.');
  }
  const principals = Object.freeze(agentsSpec.map(normalizeRosterEntry));
  const permissionsCount = principals.reduce((sum, p) => sum + p.permissions.length, 0);
  const body = { principals, permissionsCount };
  return Object.freeze({ ...body, rosterDigest: sha256Prefixed(body) });
}

function normalizeStateTransition(transition = {}, index = 0) {
  const beforeState = transition.beforeState ?? {};
  const afterState = transition.afterState ?? {};
  return Object.freeze({
    step: Number.isFinite(transition.step) ? Number(transition.step) : index + 1,
    target: requiredString(transition.target, 'SQLAB_TRANSITION_TARGET_REQUIRED', 256),
    beforeStateHash: transition.beforeStateHash ?? sha256Prefixed(beforeState),
    afterStateHash: transition.afterStateHash ?? sha256Prefixed(afterState),
    deltaSummary: requiredString(transition.deltaSummary, 'SQLAB_TRANSITION_SUMMARY_REQUIRED', 512)
  });
}

function buildExecutionTrace(traceSpec = {}) {
  const events = Array.isArray(traceSpec.events) ? traceSpec.events : [];
  if (events.length === 0) {
    throw sqlabFailure('SQLAB_EVENTS_REQUIRED', 'Execution trace must record at least one event.');
  }
  const normalizedEvents = Object.freeze(events.map((ev, idx) => Object.freeze({
    sequence: idx + 1,
    timestampMs: Number.isFinite(ev.timestampMs) ? Number(ev.timestampMs) : 1_700_000_000_000 + idx * 100,
    actorId: requiredString(ev.actorId, 'SQLAB_EVENT_ACTOR_REQUIRED', 128),
    eventType: requiredString(ev.eventType, 'SQLAB_EVENT_TYPE_REQUIRED', 128),
    summary: requiredString(ev.summary, 'SQLAB_EVENT_SUMMARY_REQUIRED', 512)
  })));
  const interactions = Object.freeze((traceSpec.interactions ?? []).map((item, idx) => Object.freeze({
    sequence: idx + 1,
    from: requiredString(item.from, 'SQLAB_INTERACTION_FROM_REQUIRED', 128),
    to: requiredString(item.to, 'SQLAB_INTERACTION_TO_REQUIRED', 128),
    channel: requiredString(item.channel ?? 'kernel-bus', 'SQLAB_INTERACTION_CHANNEL_REQUIRED', 64),
    intent: requiredString(item.intent, 'SQLAB_INTERACTION_INTENT_REQUIRED', 256)
  })));
  const stateTransitions = Object.freeze((traceSpec.stateTransitions ?? []).map(normalizeStateTransition));
  const body = { events: normalizedEvents, interactions, stateTransitions };
  return Object.freeze({ ...body, traceDigest: sha256Prefixed(body) });
}

function normalizeEvidenceArtifact(artifact = {}) {
  const rawPayload = typeof artifact.rawPayload === 'string'
    ? artifact.rawPayload
    : JSON.stringify(artifact.rawPayload ?? {});
  const sha256 = sha256Prefixed(rawPayload);
  return Object.freeze({
    artifactId: requiredString(artifact.artifactId, 'SQLAB_ARTIFACT_ID_REQUIRED', 128),
    sourceType: requiredString(artifact.sourceType, 'SQLAB_ARTIFACT_SOURCE_REQUIRED', 64),
    sensorStatus: requiredString(artifact.sensorStatus ?? 'healthy', 'SQLAB_SENSOR_STATUS_REQUIRED', 64),
    rawPayload,
    byteLength: Buffer.byteLength(rawPayload, 'utf8'),
    sha256
  });
}

function buildRawEvidenceVault(evidenceItems = []) {
  if (!Array.isArray(evidenceItems) || evidenceItems.length === 0) {
    throw sqlabFailure('SQLAB_EVIDENCE_REQUIRED', 'Scenario must include at least one raw evidence artifact.');
  }
  const artifacts = Object.freeze(evidenceItems.map(normalizeEvidenceArtifact));
  const hasDegradedSensor = artifacts.some((art) => art.sensorStatus !== 'healthy');
  const body = {
    artifacts,
    artifactCount: artifacts.length,
    hasDegradedSensor
  };
  return Object.freeze({ ...body, vaultDigest: sha256Prefixed(body) });
}

function normalizeVerdictEntry(verdict = {}, knownArtifactIds) {
  const verifierId = requiredString(verdict.verifierId, 'SQLAB_VERIFIER_ID_REQUIRED', 128);
  const outcome = requiredString(verdict.outcome, 'SQLAB_VERDICT_OUTCOME_REQUIRED', 32);
  if (!OUTCOME_CLASSES.includes(outcome)) {
    throw sqlabFailure('SQLAB_VERDICT_OUTCOME_INVALID', `Unsupported verdict outcome: ${outcome}`);
  }
  const evidenceRefs = Array.isArray(verdict.evidenceRefs) ? verdict.evidenceRefs : [];
  if (evidenceRefs.length === 0 || evidenceRefs.some((ref) => !knownArtifactIds.has(ref))) {
    throw sqlabFailure('SQLAB_VERDICT_EVIDENCE_UNRESOLVED', `Verifier ${verifierId} references unknown evidence.`);
  }
  const entry = {
    verifierId,
    deterministic: Boolean(verdict.deterministic),
    independentOfGenerator: Boolean(verdict.independentOfGenerator),
    passed: Boolean(verdict.passed),
    outcome,
    checkedInvariants: Object.freeze(Array.isArray(verdict.checkedInvariants) ? verdict.checkedInvariants.slice() : []),
    evidenceRefs: Object.freeze(evidenceRefs.slice()),
    rationale: requiredString(verdict.rationale ?? verifierId, 'SQLAB_VERDICT_RATIONALE_REQUIRED', 512)
  };
  return Object.freeze({ ...entry, verdictDigest: sha256Prefixed(entry) });
}

function buildIndependentVerdicts(verdictSpecs = [], rawVault) {
  if (!Array.isArray(verdictSpecs) || verdictSpecs.length === 0) {
    throw sqlabFailure('SQLAB_VERDICTS_REQUIRED', 'At least one deterministic independent verdict is required.');
  }
  const knownArtifactIds = new Set((rawVault?.artifacts ?? []).map((a) => a.artifactId));
  const verdicts = Object.freeze(verdictSpecs.map((v) => normalizeVerdictEntry(v, knownArtifactIds)));
  const allIndependentAndDeterministic = verdicts.every((v) => v.deterministic && v.independentOfGenerator);
  if (!allIndependentAndDeterministic) {
    throw sqlabFailure('SQLAB_VERIFIER_NOT_INDEPENDENT', 'All qualification verifiers must be deterministic and independent.');
  }
  const body = {
    verdicts,
    allIndependentAndDeterministic,
    allPassed: verdicts.every((v) => v.passed)
  };
  return Object.freeze({ ...body, verdictsDigest: sha256Prefixed(body) });
}

function computeTokenAndBudgetMetrics(spec) {
  const tokensObj = spec.tokens || {};
  const limitsObj = spec.budgetLimits || {};
  const promptTokens = Number(tokensObj.promptTokens || 0);
  const completionTokens = Number(tokensObj.completionTokens || 0);
  const totalTokens = promptTokens + completionTokens;
  const maxWallTimeMs = Number(limitsObj.maxWallTimeMs || 60_000);
  const maxTokens = Number(limitsObj.maxTokens || 100_000);
  return { promptTokens, completionTokens, totalTokens, maxWallTimeMs, maxTokens };
}

function buildResourceMetrics(spec = {}) {
  const wallTimeMs = Number(spec.wallTimeMs || 0);
  const tb = computeTokenAndBudgetMetrics(spec);
  const withinBudget = wallTimeMs <= tb.maxWallTimeMs && tb.totalTokens <= tb.maxTokens;
  const body = {
    wallTimeMs,
    p50LatencyMs: Number(spec.p50LatencyMs || wallTimeMs),
    p95LatencyMs: Number(spec.p95LatencyMs || wallTimeMs),
    cpuTimeMs: Number(spec.cpuTimeMs || Math.round(wallTimeMs * 0.6)),
    peakRamMb: Number(spec.peakRamMb || 128),
    tokens: Object.freeze({
      promptTokens: tb.promptTokens,
      completionTokens: tb.completionTokens,
      totalTokens: tb.totalTokens
    }),
    estimatedCostUsd: Number(spec.estimatedCostUsd || Number((tb.totalTokens * 0.000003).toFixed(6))),
    budgetCompliance: Object.freeze({
      withinBudget,
      maxWallTimeMs: tb.maxWallTimeMs,
      maxTokens: tb.maxTokens
    })
  };
  return Object.freeze({ ...body, metricsDigest: sha256Prefixed(body) });
}

module.exports = {
  buildEnvironmentManifest,
  buildMissionSpec,
  buildAgentRoster,
  buildExecutionTrace,
  buildRawEvidenceVault,
  buildIndependentVerdicts,
  buildResourceMetrics
};
