'use strict';

const crypto = require('node:crypto');
const { withTransaction } = require('../db');
const { canonicalJson } = require('./aTeam/variants/variantExecutionHelpers');
const { getResponsibility } = require('./shev/responsibilityService');
const { normalizedObservation } = require('./shev/observationService');
const thoughtStore = require('./endogenousThoughtStoreService');
const migration = require('../db/migrations/migrateEndogenousThoughtDetections');

const CONDITIONS = new Set(['full', 'planned_control', 'curiosity_ablated',
  'shev_initiative_ablated', 'agow_arbitration_ablated', 'metacognition_ablated',
  'memory_ablated']);
const TERMINAL_STATES = ['STOPPED', 'ABSTAINED', 'FAILED'];
const BOUNDARIES = Object.freeze({ authorityGranted: false, promotionEligible: false,
  taskCreated: false, externalActionAllowed: false });

function coded(code, message) {
  return Object.assign(new Error(message), { code });
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function score(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) {
    throw coded('ENDOGENOUS_ASSESSMENT_INVALID', `${field} must be between zero and one.`);
  }
  return number;
}

function positiveInteger(value, field, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw coded('ENDOGENOUS_POLICY_INVALID', `${field} must be a bounded positive integer.`);
  }
  return value;
}

function normalizeBudget(budget) {
  const valid = budget && Number.isSafeInteger(budget.tokens) && budget.tokens > 0
    && Number.isFinite(budget.usd) && budget.usd >= 0
    && Number.isSafeInteger(budget.seconds) && budget.seconds > 0;
  if (!valid) throw coded('ENDOGENOUS_BUDGET_INVALID', 'A positive token, cost and time budget is required.');
  return { tokens: budget.tokens, usd: budget.usd, seconds: budget.seconds };
}

function normalizeCooldown(value) {
  const cooldownMs = Number(value ?? 60000);
  if (!Number.isSafeInteger(cooldownMs) || cooldownMs < 0 || cooldownMs > 86400000) {
    throw coded('ENDOGENOUS_POLICY_INVALID', 'cooldownMs must be between zero and one day.');
  }
  return cooldownMs;
}

function normalizePolicy(policy) {
  if (!nonEmpty(policy?.id) || !CONDITIONS.has(policy.condition)) {
    throw coded('ENDOGENOUS_POLICY_INVALID', 'Policy id and registered ETT condition are required.');
  }
  return { id: policy.id, condition: policy.condition,
    minScore: score(policy.minScore ?? 0.55, 'minScore'),
    minInformationGain: score(policy.minInformationGain ?? 0.35, 'minInformationGain'),
    minLearningProgress: score(policy.minLearningProgress ?? 0.01, 'minLearningProgress'),
    cooldownMs: normalizeCooldown(policy.cooldownMs),
    maxOpenEpisodes: positiveInteger(policy.maxOpenEpisodes ?? 1, 'maxOpenEpisodes', 10),
    maxBudget: normalizeBudget(policy.maxBudget || { tokens: 12000, usd: 0.5, seconds: 120 }) };
}

function normalizeAssessment(assessment) {
  if (!nonEmpty(assessment?.ref)) {
    throw coded('ENDOGENOUS_ASSESSMENT_INVALID', 'Assessment provenance reference is required.');
  }
  return { ref: assessment.ref, anomaly: score(assessment.anomaly, 'anomaly'),
    novelty: score(assessment.novelty, 'novelty'),
    expectedInformationGain: score(assessment.expectedInformationGain, 'expectedInformationGain'),
    learningProgress: score(assessment.learningProgress, 'learningProgress'),
    cost: score(assessment.cost, 'cost'), risk: score(assessment.risk, 'risk'),
    sampleCount: positiveInteger(assessment.sampleCount, 'sampleCount', 1000000) };
}

function normalizeInput(input) {
  for (const field of ['organizationId', 'projectId', 'agentId', 'observationId']) {
    if (!nonEmpty(input?.[field])) throw coded('ENDOGENOUS_SCOPE_REQUIRED', `${field} is required.`);
  }
  return { organizationId: input.organizationId, projectId: input.projectId,
    agentId: input.agentId, observationId: input.observationId,
    policy: normalizePolicy(input.policy), assessment: normalizeAssessment(input.assessment),
    budget: normalizeBudget(input.budget), nowMs: Number.isFinite(input.nowMs) ? input.nowMs : Date.now() };
}

function digest(value) {
  return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function scopedId(prefix, basis) {
  return `${prefix}_${digest(basis).slice(0, 24)}`;
}

async function loadContext(db, input) {
  const agent = await db.get(`SELECT a.id,a.status,a.runtime_pid,a.is_apoptotic,a.cognitive_budget
    FROM agents a JOIN workspaces w ON w.id=a.workspace_id
    WHERE a.id=? AND w.organization_id=? AND w.project_id=?`,
  input.agentId, input.organizationId, input.projectId);
  if (!agent) throw coded('ENDOGENOUS_AGENT_SCOPE_MISMATCH', 'Agent is outside the requested tenant scope.');
  const observation = await db.get(`SELECT * FROM shev_observations
    WHERE project_id=? AND id=?`, input.projectId, input.observationId);
  if (!observation) throw coded('ENDOGENOUS_OBSERVATION_NOT_FOUND', 'Scoped SHEV observation was not found.');
  verifyObservation(observation);
  const responsibility = await getResponsibility(db, input.projectId);
  return { agent, observation, responsibility };
}

function verifyObservation(row) {
  let evidenceRefs;
  try { evidenceRefs = JSON.parse(row.evidence_json); } catch (_) {
    throw coded('ENDOGENOUS_OBSERVATION_INTEGRITY_FAILED', 'Observation evidence is not valid JSON.');
  }
  const normalized = normalizedObservation({ id: row.id, projectId: row.project_id,
    domain: row.domain, dimension: row.dimension, kind: row.kind,
    epistemicStatus: row.epistemic_status, source: row.source,
    observedAt: row.observed_at, validUntil: row.valid_until,
    summary: row.summary, evidenceRefs });
  const expected = crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
  if (expected !== row.content_hash) {
    throw coded('ENDOGENOUS_OBSERVATION_INTEGRITY_FAILED', 'Observation content hash is invalid.');
  }
}

function detectionBasis(input, context) {
  return { organizationId: input.organizationId, projectId: input.projectId,
    agentId: input.agentId, observationId: input.observationId, policyId: input.policy.id,
    mandateVersion: context.responsibility?.mandateVersion || 0 };
}

function requestMaterial(input, basis) {
  return { schema: 'genos.endogenous-thought-detection-request/v1', basis,
    policy: input.policy, assessment: input.assessment, budget: input.budget };
}

function computedScore(assessment) {
  const positive = assessment.anomaly * 0.25 + assessment.novelty * 0.2
    + assessment.expectedInformationGain * 0.3 + assessment.learningProgress * 0.2;
  const penalty = assessment.cost * 0.025 + assessment.risk * 0.025;
  return Number(Math.max(0, Math.min(1, positive - penalty)).toFixed(6));
}

function budgetWithin(actual, maximum) {
  return actual.tokens <= maximum.tokens && actual.usd <= maximum.usd
    && actual.seconds <= maximum.seconds;
}

function rejection(reason, total) {
  return { outcome: 'rejected', reason, score: total };
}

function agentGate(context, total) {
  const agent = context.agent;
  if (agent.runtime_pid || agent.status === 'running') return rejection('agent-not-idle', total);
  if (agent.is_apoptotic || Number(agent.cognitive_budget) <= 0) {
    return rejection('agent-unavailable', total);
  }
  if (!context.responsibility || context.responsibility.status !== 'active') {
    return rejection('mandate-inactive', total);
  }
  return null;
}

function observationGate(input, context, total) {
  const observation = context.observation;
  if (!context.dimension) return rejection('out-of-mandate', total);
  if (observation.kind === 'state') return rejection('no-actionable-signal', total);
  if (observation.valid_until && Date.parse(observation.valid_until) <= input.nowMs) {
    return rejection('stale-observation', total);
  }
  const admissibleUnknown = observation.kind === 'blind_spot'
    && observation.epistemic_status === 'unknown';
  if (observation.epistemic_status !== 'observed' && !admissibleUnknown) {
    return rejection('insufficient-evidence', total);
  }
  return null;
}

function assessmentGate(input, total) {
  if (input.assessment.sampleCount >= 2
    && input.assessment.learningProgress <= input.policy.minLearningProgress) {
    return rejection('unlearnable-noise', total);
  }
  if (input.assessment.expectedInformationGain < input.policy.minInformationGain) {
    return rejection('low-information-gain', total);
  }
  if (!budgetWithin(input.budget, input.policy.maxBudget)) {
    return rejection('budget-exceeds-policy', total);
  }
  if (total < input.policy.minScore) return rejection('below-threshold', total);
  return null;
}

function baseDecision(input, context) {
  const total = computedScore(input.assessment);
  const responsibility = context.responsibility;
  const dimension = responsibility?.mandate.dimensions
    .find((item) => item.name === context.observation.dimension);
  const scoped = { ...context, dimension };
  const denied = agentGate(scoped, total) || observationGate(input, scoped, total)
    || assessmentGate(input, total);
  return denied || { outcome: 'candidate', reason: 'bounded-candidate', score: total, dimension };
}

async function capacityDecision(db, input, decision) {
  if (decision.outcome !== 'candidate') return decision;
  const open = await db.get(`SELECT COUNT(*) AS count FROM endogenous_thought_episodes
    WHERE organization_id=? AND project_id=? AND agent_id=?
      AND current_state NOT IN (${TERMINAL_STATES.map(() => '?').join(',')})`,
  input.organizationId, input.projectId, input.agentId, ...TERMINAL_STATES);
  if (Number(open.count) >= input.policy.maxOpenEpisodes) {
    return { outcome: 'rejected', reason: 'open-episode-limit', score: decision.score };
  }
  const latest = await db.get(`SELECT evaluated_at FROM endogenous_thought_detection_receipts
    WHERE organization_id=? AND project_id=? AND agent_id=? AND outcome='candidate'
    ORDER BY evaluated_at DESC LIMIT 1`, input.organizationId, input.projectId, input.agentId);
  if (latest && input.nowMs - Date.parse(latest.evaluated_at) < input.policy.cooldownMs) {
    return { outcome: 'rejected', reason: 'cooldown', score: decision.score };
  }
  return decision;
}

function detectionPayload(values) {
  const { input, context, identity, decision } = values;
  const mandateRef = context.responsibility
    ? `${context.responsibility.authorityRef}#v${context.responsibility.mandateVersion}` : null;
  return { schema: 'genos.endogenous-thought-detection/v1', detectionId: identity.detectionId,
    requestHash: identity.requestHash, organizationId: input.organizationId,
    projectId: input.projectId, agentId: input.agentId,
    observationRef: `shev-observation:${input.projectId}:${input.observationId}`,
    policy: input.policy, assessment: input.assessment, budget: input.budget,
    mandateRef, mandateVersion: context.responsibility?.mandateVersion || null,
    decision: { outcome: decision.outcome, reason: decision.reason, score: decision.score },
    boundaries: BOUNDARIES,
    episodeId: decision.outcome === 'candidate' ? scopedId('ett_episode', identity.basis) : null };
}

function readDetection(row, requestHash) {
  if (!row) return null;
  let payload;
  try { payload = JSON.parse(row.payload_json); } catch (_) {
    throw coded('ENDOGENOUS_DETECTION_INTEGRITY_FAILED', 'Detection receipt is not valid JSON.');
  }
  if (row.content_hash !== digest(payload)) {
    throw coded('ENDOGENOUS_DETECTION_INTEGRITY_FAILED', 'Detection receipt hash is invalid.');
  }
  if (payload.requestHash !== requestHash) {
    throw coded('ENDOGENOUS_DETECTION_IDEMPOTENCY_CONFLICT', 'Detection identity is bound to another request.');
  }
  return { payload, evaluatedAt: row.evaluated_at, replayed: true };
}

async function storedDetection(db, input, identity) {
  const row = await db.get(`SELECT * FROM endogenous_thought_detection_receipts
    WHERE organization_id=? AND project_id=? AND detection_id=?`,
  input.organizationId, input.projectId, identity.detectionId);
  return readDetection(row, identity.requestHash);
}

async function persistDetection(db, input) {
  const { normalized, identity, payload } = input;
  const evaluatedAt = new Date(normalized.nowMs).toISOString();
  return withTransaction(db, async () => {
    await db.run(`INSERT OR IGNORE INTO endogenous_thought_detection_receipts
      (organization_id,project_id,detection_id,agent_id,observation_id,policy_id,
       mandate_version,outcome,reason,score,episode_id,content_hash,payload_json,evaluated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, normalized.organizationId, normalized.projectId,
    identity.detectionId, normalized.agentId, normalized.observationId, normalized.policy.id,
    payload.mandateVersion, payload.decision.outcome, payload.decision.reason,
    payload.decision.score, payload.episodeId, digest(payload), canonicalJson(payload), evaluatedAt);
    return storedDetection(db, normalized, identity);
  });
}

function sourceRefs(context, input, payload) {
  const evidence = JSON.parse(context.observation.evidence_json || '[]');
  return [...new Set([payload.observationRef, input.assessment.ref, payload.mandateRef,
    ...evidence].filter(nonEmpty))];
}

function episodePayload(values) {
  const { input, context, payload, refs } = values;
  return { transitionId: scopedId('ett_transition_detected', payload.detectionId),
    episodeId: payload.episodeId, agentId: input.agentId, projectId: input.projectId,
    mandateRef: payload.mandateRef, fromState: null, toState: 'DETECTED',
    triggerRef: payload.observationRef, questionRef: null, decisionRef: null,
    taskRef: null, jobRef: null, budget: input.budget, evidenceRefs: refs,
    stopReason: null, occurredAt: new Date(context.observation.observed_at).toISOString(),
    previousReceiptId: null };
}

function questionPayload(values) {
  const { input, context, payload, refs, dimension, evaluatedAt } = values;
  const summary = String(context.observation.summary).trim();
  return { questionId: scopedId('ett_question', payload.detectionId), episodeId: payload.episodeId,
    domain: context.observation.domain,
    text: `Quelle cause vérifiable explique le signal « ${summary} » ?`,
    hypothesis: `Une condition reproductible explique l'écart observé sur ${dimension.name}.`,
    falsifier: `Une mesure indépendante satisfait « ${dimension.expected} » sans reproduire cet écart.`,
    method: `Comparer le signal aux critères du mandat puis tenter de réfuter l'hypothèse.`,
    expectedEvidence: [...new Set([...dimension.acceptance, ...refs])],
    expectedInformationGain: input.assessment.expectedInformationGain,
    estimatedCost: input.budget, risk: input.assessment.risk,
    sourceRefs: refs, createdAt: evaluatedAt };
}

async function materializeCandidate(db, input) {
  const { normalized, context, detection } = input;
  const payload = detection.payload;
  const dimension = context.responsibility.mandate.dimensions
    .find((item) => item.name === context.observation.dimension);
  const refs = sourceRefs(context, normalized, payload);
  const started = await thoughtStore.startEpisode(db, { organizationId: normalized.organizationId,
    projectId: normalized.projectId,
    payload: episodePayload({ input: normalized, context, payload, refs }) });
  const question = questionPayload({ input: normalized, context, payload, refs,
    dimension, evaluatedAt: detection.evaluatedAt });
  const persisted = await thoughtStore.persistQuestion(db, { organizationId: normalized.organizationId,
    projectId: normalized.projectId, payload: question });
  const questionedPayload = { ...episodePayload({ input: normalized, context, payload, refs }),
    transitionId: scopedId('ett_transition_questioned', payload.detectionId),
    fromState: 'DETECTED', toState: 'QUESTIONED', questionRef: persisted.receipt.receiptId,
    occurredAt: detection.evaluatedAt, previousReceiptId: started.receipt.receiptId };
  const questioned = await thoughtStore.transitionEpisode(db, { organizationId: normalized.organizationId,
    projectId: normalized.projectId, payload: questionedPayload });
  return { status: 'questioned', detection, episode: questioned, question: persisted };
}

async function detectAndQuestion(db, input) {
  if (input?.policy?.enabled !== true) return { status: 'skipped', reason: 'disabled' };
  const normalized = normalizeInput(input);
  await thoughtStore.ensure(db);
  await migration.migrateEndogenousThoughtDetections(db);
  const context = await loadContext(db, normalized);
  const basis = detectionBasis(normalized, context);
  const identity = { basis, detectionId: scopedId('ett_detection', basis),
    requestHash: digest(requestMaterial(normalized, basis)) };
  let detection = await storedDetection(db, normalized, identity);
  if (!detection) {
    const base = baseDecision(normalized, context);
    const decision = await capacityDecision(db, normalized, base);
    const payload = detectionPayload({ input: normalized, context, identity, decision });
    detection = await persistDetection(db, { normalized, identity, payload });
    detection.replayed = false;
  }
  if (detection.payload.decision.outcome !== 'candidate') {
    return { status: 'rejected', reason: detection.payload.decision.reason, detection };
  }
  return materializeCandidate(db, { normalized, context, detection });
}

module.exports = { BOUNDARIES, detectAndQuestion, computedScore, normalizePolicy, normalizeAssessment };
