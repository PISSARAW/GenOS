'use strict';

const timescale = require('./predictiveTimescale/predictiveTimescaleService');
const precisionLearning = require('./predictiveTimescale/precisionLearningService');
const selfTwin = require('./selfTwin/selfTwinService');
const candidateAdapter = require('./agow/candidates/candidateAdapterService');

function mappedLevel(eventType) {
  if (/PERCEPTION|OBSERVATION/i.test(eventType)) return 'T0';
  if (/WORKER|TOOL|ACTION/i.test(eventType)) return 'T1';
  if (/STRATEGY|PLAN/i.test(eventType)) return 'T2';
  if (/MISSION|ORCHESTRATION/i.test(eventType)) return 'T3';
  return null;
}

function numericPairs(event) {
  const predicted = event.payload?.predictedMetrics;
  const observed = event.payload?.metrics;
  if (!predicted || !observed || typeof predicted !== 'object' || typeof observed !== 'object') return [];
  return Object.keys(predicted).filter((metric) => Number.isFinite(predicted[metric]) && Number.isFinite(observed[metric]))
    .map((metric) => ({ metric, prediction: predicted[metric], observation: observed[metric] }));
}

async function recordPredictionErrors(ctx, event) {
  const level = mappedLevel(event.eventType);
  if (!level) return [];
  const pairs = numericPairs(event);
  const refs = await trustedEvidenceRefs(ctx, event.payload);
  const results = [];
  for (const pair of pairs) {
    const calibration = await precisionLearning.record({ db: ctx.db, agentId: ctx.agentId,
      input: { modelId: event.payload.predictiveModelId || 'legacy_point', timescale: level,
        contextKey: event.payload.contextSignature || event.eventType,
        mean: pair.prediction, observed: pair.observation,
        variance: event.payload.predictedVariances?.[pair.metric] ?? 1 } });
    const result = await timescale.record({ db: ctx.db, agentId: ctx.agentId,
      input: { ...pair, precision: calibration.precision, timescale: level,
        evidenceRefs: refs, independentRefs: refs, now: new Date().toISOString() } });
    const candidate = result.route ? await submitErrorCandidate({ ctx, event, pair, route: result.route, refs }) : null;
    results.push({ ...result, precisionCalibration: calibration, agowAdmission: candidate });
  }
  return results;
}

async function trustedEvidenceRefs(ctx, payload) {
  if (!Array.isArray(payload.evidenceRefs)) return [];
  const verified = typeof ctx.verifyEvidenceRefs === 'function'
    ? await ctx.verifyEvidenceRefs(payload.evidenceRefs) : await verifyProvenanceEvidence(ctx, payload.evidenceRefs);
  return Array.isArray(verified) ? verified.filter((item) => item?.verified === true
    && /^[a-f0-9]{64}$/.test(item.artifactHash || '')).map((item) => item.artifactHash) : [];
}

async function verifyProvenanceEvidence(ctx, refs) {
  try {
    const evidence = require('./decisionEvidenceService');
    const hashes = evidence.normalizeEvidenceRefs(refs);
    const mission = ctx.normalizedMission || {};
    const scope = evidence.normalizeScope({ organizationId: mission.organizationId, projectId: mission.projectId });
    await evidence.verifyEvidenceScope(ctx.db, hashes, scope);
    return hashes.map((artifactHash) => ({ verified: true, artifactHash }));
  } catch (_) { return []; }
}

async function submitErrorCandidate(options) {
  const { ctx, event, pair, route, refs } = options;
  return candidateAdapter.submit({ db: ctx.db, agentId: ctx.agentId, module: 'epistemic',
    activeGoal: ctx.normalizedMission?.missionId || '', observation: {
      candidateId: `timescale:${route.from}:${pair.metric}:${event.eventId || event.id}`,
      semanticType: 'cross_scale_prediction_error', instanceId: event.eventId || event.id,
      compactPreview: `Erreur persistante ${pair.metric}, routée ${route.from} → ${route.to}`,
      predictionError: Math.min(1, Math.abs(route.error)), confidence: 0.5,
      evidenceCoverage: refs.length ? 1 : 0, evidenceRefs: refs, causalEvidence: refs.length > 0,
      actionable: false, constraints: { integrity: 'review' }
    } });
}

async function recordSelfTwinFeedback(ctx, event) {
  const feedback = event.payload?.selfTwinFeedback;
  const scope = event.payload?.gvxScope || ctx.gvxScope;
  if (!feedback || !scope?.organizationId || !scope?.projectId || !feedback.predictionId) return null;
  const evidenceRefs = await trustedEvidenceRefs(ctx, feedback);
  return selfTwin.observe({ db: ctx.db, scope: { ...scope, entityId: ctx.agentId },
    predictionId: feedback.predictionId, observations: feedback.observations,
    evidenceRefs, candidateSubmitter: candidateAdapter.submit });
}

async function process(ctx, event) {
  const payload = event.payload || {};
  try {
    const predictionErrors = await recordPredictionErrors(ctx, { ...event, payload });
    const selfTwinFeedback = await recordSelfTwinFeedback(ctx, { ...event, payload });
    return { predictionErrors, selfTwinFeedback, status: 'recorded' };
  } catch (error) {
    return { predictionErrors: [], selfTwinFeedback: null, status: 'deferred', reason: error.code || 'runtime-bridge-failed' };
  }
}

module.exports = { process, mappedLevel, numericPairs, recordPredictionErrors, trustedEvidenceRefs, verifyProvenanceEvidence };
