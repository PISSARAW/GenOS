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

async function observations(db, input, observation) {
  try {
    return await db.all(`SELECT id,kind,epistemic_status,summary,evidence_json,observed_at
      FROM shev_observations WHERE project_id=? AND dimension=? ORDER BY observed_at,id`,
    input.projectId, observation.dimension);
  } catch (_) { return [observation]; }
}

function bounded(value) {
  return Number(Math.max(0, Math.min(1, value)).toFixed(6));
}

function tokens(value) {
  return new Set(String(value || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
}

function similarity(left, right) {
  const a = tokens(left);
  const b = tokens(right);
  if (!a.size && !b.size) return 1;
  const intersection = [...a].filter((item) => b.has(item)).length;
  return intersection / Math.max(1, new Set([...a, ...b]).size);
}

function noveltyOf(rows, observation) {
  const prior = rows.filter((row) => row.id !== observation.id);
  if (!prior.length) return 1;
  const nearest = Math.max(...prior.map((row) => similarity(row.summary, observation.summary)));
  return bounded(1 - nearest);
}

function entropy(values) {
  if (!values.length) return 0;
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  if (counts.size <= 1) return 0;
  let result = 0;
  for (const count of counts.values()) {
    const probability = count / values.length;
    result -= probability * Math.log2(probability);
  }
  return result / Math.log2(counts.size);
}

function informationGain(rows, observation, novelty) {
  if (observation.epistemic_status === 'unknown') return bounded(0.5 + novelty * 0.5);
  const categories = rows.map((row) => `${row.kind}:${row.epistemic_status}`);
  const diversity = entropy(categories);
  return bounded(0.35 + novelty * 0.4 + diversity * 0.25);
}

function learningProgress(rows, observation, novelty) {
  const comparable = rows.filter((row) => row.kind === observation.kind);
  if (comparable.length <= 2) return 0.5;
  const recent = comparable.slice(-4);
  const distinct = new Set(recent.map((row) => String(row.summary || '').trim().toLowerCase())).size;
  return bounded((distinct / recent.length) * 0.7 + novelty * 0.3);
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
  const rows = await observations(db, input, observation);
  const seen = Math.max(1, rows.length);
  const kindScores = { degradation: 0.9, risk: 0.8, capability_gap: 0.7, blind_spot: 0.6, opportunity: 0.5, state: 0.2 };
  const anomaly = kindScores[observation.kind];
  const novelty = noveltyOf(rows, observation);
  const derived = {
    ref: `assessment:empirical-v2:${observation.id}`,
    anomaly: anomaly != null ? anomaly : 0.5,
    novelty,
    expectedInformationGain: informationGain(rows, observation, novelty),
    learningProgress: learningProgress(rows, observation, novelty),
    cost: 0.1, risk: observation.kind === 'risk' ? 0.5 : 0.05,
    sampleCount: seen,
  };
  return mergeAssessment(derived, existing);
}

module.exports = { normalizeAssessment, hasCompleteAssessment, deriveAssessment };
