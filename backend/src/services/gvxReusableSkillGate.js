'use strict';

const manifests = require('./gvxReusableSkillManifest');

const HASH = /^[a-f0-9]{64}$/;

function evaluateSkillRelease(input) {
  const authorization = manifests.authorizeSkillManifest(input?.manifest, input?.lease, input?.now);
  const assessments = {
    transfer: assessTransfer(input), responsibility: assessResponsibility(input),
    regression: assessRegression(input)
  };
  const context = { input, authorization, assessments };
  if (assessments.regression.status === 'regressed') return rollbackDecision(context);
  const reasons = blockedReasons(input, authorization, assessments);
  if (reasons.length) return decision({ ...context, status: 'blocked', reasons });
  return { ...decision({ ...context, status: 'ready_for_promotion_review', reasons: [] }),
    promotionAuthority: 'none', automaticPromotion: false };
}

function assessTransfer(input) {
  const trials = input?.heldOutTrials;
  if (!Array.isArray(trials) || trials.length < 2) return failed('held-out-trials-insufficient');
  if (!trials.every(validMeasuredEvidence)) return failed('held-out-evidence-invalid');
  if (!trials.every((trial) => trial.split === 'held_out')) return failed('held-out-split-required');
  if (!trials.every(improved)) return failed('held-out-benefit-not-demonstrated');
  const domains = new Set(trials.map((trial) => trial.domain));
  if (domains.size < 2 || ![...domains].some((domain) => domain !== input.manifest?.sourceDomain)) {
    return failed('cross-domain-transfer-required');
  }
  if (new Set(trials.map((trial) => trial.verifierId)).size < 2) return failed('independent-verifiers-required');
  return { status: 'passed', domains: [...domains].sort(), evidenceRefs: evidenceRefs(trials) };
}

function assessResponsibility(input) {
  const responsibility = input?.responsibility;
  const benefit = input?.externalBenefit;
  if (!responsibility || responsibility.ownerKind !== 'external' || !text(responsibility.ownerId)
      || !text(responsibility.obligationId) || !text(responsibility.metric)) {
    return failed('external-responsibility-required');
  }
  if (!validMeasuredEvidence(benefit) || benefit.responsibilityId !== responsibility.obligationId
      || benefit.metric !== responsibility.metric || !improved(benefit)) {
    return failed('external-benefit-evidence-invalid');
  }
  return { status: 'passed', obligationId: responsibility.obligationId,
    ownerId: responsibility.ownerId, evidenceRefs: evidenceRefs([benefit]) };
}

function assessRegression(input) {
  const windows = input?.regressionWindows;
  if (!Array.isArray(windows) || windows.length < 2) return failed('regression-windows-insufficient');
  if (!windows.every(validRegressionWindow)) return failed('regression-evidence-invalid');
  if (new Set(windows.map((window) => window.contextHash)).size < 2) {
    return failed('regression-contexts-insufficient');
  }
  const regressed = windows.filter((window) => window.regression === true || !improvedOrEqual(window));
  return regressed.length ? { status: 'regressed', evidenceRefs: evidenceRefs(regressed) }
    : { status: 'passed', evidenceRefs: evidenceRefs(windows) };
}

function blockedReasons(input, authorization, assessments) {
  const reasons = [];
  if (!manifests.verifySkillManifest(input?.manifest)) reasons.push('skill-manifest-invalid');
  if (authorization.allowed !== true) reasons.push(authorization.reason);
  for (const assessment of Object.values(assessments)) {
    if (assessment.status !== 'passed') reasons.push(assessment.reason);
  }
  return [...new Set(reasons.filter(Boolean))];
}

function rollbackDecision(context) {
  return { ...decision({ ...context, status: 'rollback_required', reasons: ['regression-detected'] }),
    rollback: { automatic: false, requiresAuthorization: true,
      target: context.input?.manifest?.rollbackTarget || null } };
}

function decision(context) {
  const { status, input, authorization, assessments, reasons } = context;
  return { schema: 'genos.gvx.reusable-skill-decision/v1', status,
    skillId: input?.manifest?.skillId || null, version: input?.manifest?.version || null,
    manifestHash: input?.manifest?.manifestHash || null, authorization, assessments, reasons };
}

function validMeasuredEvidence(item) {
  return Boolean(item && text(item.domain) && text(item.metric) && text(item.verifierId)
    && item.independent === true && HASH.test(item.artifactHash || '')
    && Number.isFinite(item.baseline) && Number.isFinite(item.candidate)
    && ['higher', 'lower'].includes(item.direction));
}

function validRegressionWindow(window) {
  return validMeasuredEvidence(window) && HASH.test(window.contextHash || '')
    && typeof window.regression === 'boolean';
}

function improved(item) {
  return item.direction === 'higher' ? item.candidate > item.baseline : item.candidate < item.baseline;
}

function improvedOrEqual(item) {
  return item.direction === 'higher' ? item.candidate >= item.baseline : item.candidate <= item.baseline;
}

function evidenceRefs(items) { return [...new Set(items.map((item) => item.artifactHash))].sort(); }
function failed(reason) { return { status: 'failed', reason, evidenceRefs: [] }; }
function text(value) { return typeof value === 'string' && Boolean(value.trim()); }

module.exports = { evaluateSkillRelease, assessTransfer, assessResponsibility, assessRegression };
