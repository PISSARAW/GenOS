'use strict';

/** Pure evaluators for care ethics and responsibility toward the other. */

function score(value) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function assessCare({ actor, recipient, need = 0, vulnerability = 0, response = 0, dependency = 0, powerAsymmetry = 0 }) {
  if (!actor || !recipient) throw new Error('relationalEthicsService.assessCare requires actor and recipient');
  const careDemand = (score(need) + score(vulnerability) + score(dependency)) / 3;
  const responsiveness = score(response);
  const duty = careDemand > 0.5;
  return {
    framework: 'care-ethics', actor, recipient, careDemand, responsiveness,
    powerAsymmetry: score(powerAsymmetry), duty,
    verdict: !duty ? 'ordinary-relation' : responsiveness >= careDemand ? 'care-responsive' : 'care-deficient',
    executable: false,
  };
}

function evaluateCareDuty({ actor, recipient, need, response, consent = true, nonAbandonment = true }) {
  const assessment = assessCare({ actor, recipient, need, response, vulnerability: need, dependency: need });
  const compliant = assessment.duty ? response >= need && consent && nonAbandonment : true;
  return { ...assessment, framework: 'care-deontology', consent, nonAbandonment, verdict: compliant ? 'duty-satisfied' : 'duty-unfulfilled' };
}

function evaluateResponsibilityForOther({ actor, other, faceToFace = false, vulnerability = 0, totalization = false }) {
  if (!actor || !other) throw new Error('relationalEthicsService.evaluateResponsibilityForOther requires actor and other');
  const responsibility = score(vulnerability) > 0 || faceToFace === true;
  return {
    framework: 'levinasian-responsibility', actor, other, faceToFace,
    vulnerability: score(vulnerability), totalization, responsibility,
    verdict: responsibility && !totalization ? 'responsibility-awakened' : 'requires-relational-review', executable: false,
  };
}

module.exports = { assessCare, evaluateCareDuty, evaluateResponsibilityForOther };
