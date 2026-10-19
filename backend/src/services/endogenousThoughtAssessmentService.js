'use strict';

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function score(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) {
    throw Object.assign(new Error(`${field} must be between zero and one.`), { code: 'ENDOGENOUS_ASSESSMENT_INVALID' });
  }
  return number;
}

function positiveInteger(value, field, maximum) {
  if (!Number.isSafeInteger(value) || value < 1 || value > (maximum || 1000000)) {
    throw Object.assign(new Error(`${field} must be a bounded positive integer.`), { code: 'ENDOGENOUS_POLICY_INVALID' });
  }
  return value;
}

function normalizeAssessment(assessment) {
  if (assessment == null) return null;
  if (typeof assessment !== 'object') throw Object.assign(new Error('Assessment must be an object.'), { code: 'ENDOGENOUS_ASSESSMENT_INVALID' });
  const result = {};
  if (assessment.ref != null) {
    if (!nonEmpty(assessment.ref)) throw Object.assign(new Error('Assessment provenance reference is required.'), { code: 'ENDOGENOUS_ASSESSMENT_INVALID' });
    result.ref = assessment.ref;
  }
  for (const field of ['anomaly', 'novelty', 'expectedInformationGain', 'learningProgress', 'cost', 'risk']) {
    if (assessment[field] != null) result[field] = score(assessment[field], field);
  }
  if (assessment.sampleCount != null) result.sampleCount = positiveInteger(assessment.sampleCount, 'sampleCount', 1000000);
  return result;
}

function hasCompleteAssessment(assessment) {
  if (!assessment) return false;
  return ['anomaly', 'novelty', 'expectedInformationGain', 'learningProgress', 'cost', 'risk', 'sampleCount']
    .every((field) => assessment[field] != null);
}

function resolveDeriveArgs(args) {
  if (args.length === 1 && args[0] && args[0].db) return args[0];
  return { db: args[0], input: args[1], context: args[2], existing: args[3] };
}

async function countObservations(db, projectId, dimension) {
  try {
    const row = await db.get(`SELECT COUNT(*) AS count FROM shev_observations WHERE project_id=? AND dimension=?`, projectId, dimension);
    return Math.max(1, Number(row?.count || 1));
  } catch (_) { return 1; }
}

function igFromStatus(status) {
  if (status === 'unknown') return 0.85;
  if (status === 'observed') return 0.6;
  return 0.35;
}

function mergeAssessment(derived, existing) {
  const merged = { ...derived };
  if (!existing || typeof existing !== 'object') return merged;
  if (nonEmpty(existing.ref)) merged.ref = existing.ref;
  for (const field of ['anomaly', 'novelty', 'expectedInformationGain', 'learningProgress', 'cost', 'risk']) {
    if (existing[field] != null) merged[field] = existing[field];
  }
  if (existing.sampleCount != null) merged.sampleCount = existing.sampleCount;
  return merged;
}

async function deriveAssessment(...args) {
  const { db, input, context, existing } = resolveDeriveArgs(args);
  const observation = context.observation;
  const seen = await countObservations(db, input.projectId, observation.dimension);
  const kindScores = { degradation: 0.9, risk: 0.8, capability_gap: 0.7, blind_spot: 0.6, opportunity: 0.5, state: 0.2 };
  const anomaly = kindScores[observation.kind];
  const derived = {
    ref: `assessment:derived:${observation.id}`,
    anomaly: anomaly != null ? anomaly : 0.5,
    novelty: Number(Math.max(0, Math.min(1, 1 / seen)).toFixed(6)),
    expectedInformationGain: igFromStatus(observation.epistemicStatus),
    learningProgress: seen <= 2 ? 0.5 : 0.3,
    cost: 0.1, risk: observation.kind === 'risk' ? 0.5 : 0.05,
    sampleCount: seen,
  };
  return mergeAssessment(derived, existing);
}

module.exports = { normalizeAssessment, hasCompleteAssessment, deriveAssessment };