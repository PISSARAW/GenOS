'use strict';

const immunePlane = require('../immune/holobiontImmunePlane');
const immuneOverreaction = require('../immune/immuneOverreactionService');

function invalid(message) {
  return Object.assign(new Error(message), { code: 'HOLOBIONT_THREAT_MODEL_INVALID' });
}

function object(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid(`${field} must be an object.`);
  return value;
}

function evidence(value) {
  const refs = Array.isArray(value) ? [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))] : [];
  if (!refs.length) throw Object.assign(invalid('Threat model evidence is required.'), { code: 'HOLOBIONT_EVIDENCE_REQUIRED' });
  return refs;
}

function verifierList(input) {
  return [...new Set((Array.isArray(input.independentVerifierIds) ? input.independentVerifierIds : []).map(String))];
}

function observed(indicators, signals) {
  return indicators.some((signal) => signals.has(signal));
}

function verifierChecks(item, context) {
  return typeof context.input.verifyThreatModel === 'function'
    && context.input.verifyThreatModel(item, context.verifiers) === true;
}

function modelResult(context, model) {
  const { input, verifiers, signals } = context;
  const item = object(model, 'threat model');
  const indicators = Array.isArray(item.indicators) ? item.indicators : [];
  return { id: String(item.id || '').trim(), riskScore: Number(item.riskScore), evidenceRefs: evidence(item.evidenceRefs),
    indicators, observed: observed(indicators, signals), verified: verifierChecks(item, context) };
}

function incompleteAssessment(item) {
  return !item.id || !Number.isFinite(item.riskScore) || item.riskScore < 0 || item.riskScore > 1 || !item.verified;
}

function assessModels(input) {
  const models = Array.isArray(input.threatModels) ? input.threatModels : [];
  const signals = new Set(Array.isArray(input.dangerSignals) ? input.dangerSignals : []);
  const verifiers = verifierList(input);
  if (!models.length || verifiers.length < 2 || typeof input.verifyThreatModel !== 'function') return { blocked: true, reason: 'THREAT_MODEL_OR_INDEPENDENT_VERIFIERS_REQUIRED' };
  const context = { input, verifiers, signals };
  const assessed = models.map((model) => modelResult(context, model));
  const known = new Set(assessed.flatMap((item) => item.indicators));
  const unknownSignals = [...signals].filter((signal) => !known.has(signal));
  if (assessed.some(incompleteAssessment) || unknownSignals.length) {
    return { blocked: true, reason: 'UNVERIFIED_THREAT_OR_UNMODELED_DANGER', assessed, unknownSignals, verifiers };
  }
  return { blocked: false, assessed, unknownSignals, verifiers };
}

function reviewInput(input, assessment) {
  const relevant = assessment.assessed.filter((item) => item.observed);
  return { symbiontId: input.symbiontId, claim: input.claim || 'Threat-model review', resultHash: input.resultHash,
    evidenceRefs: [...new Set(relevant.flatMap((item) => item.evidenceRefs))], verifierId: assessment.verifiers[0],
    riskScore: relevant.length ? Math.max(...relevant.map((item) => item.riskScore)) : 0,
    immuneMemory: input.immuneMemory || [] };
}

async function reviewThreat(input = {}) {
  const assessment = assessModels(input);
  if (assessment.blocked) return { allowed: false, decision: 'BLOCK', ...assessment };
  const review = await immunePlane.reviewSymbiontOutput(reviewInput(input, assessment));
  const calibration = Array.isArray(input.calibrationOutcomes)
    ? immuneOverreaction.assessImmuneOverreaction({ outcomes: input.calibrationOutcomes }) : null;
  return { ...review, assessed: assessment.assessed, unknownSignals: assessment.unknownSignals,
    verifierIds: assessment.verifiers, calibration };
}

module.exports = { reviewThreat };
