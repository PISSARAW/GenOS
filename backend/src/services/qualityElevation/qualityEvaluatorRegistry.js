'use strict';

const { evaluateCreativeWriting } = require('./creativeWritingEvaluator');
const { evaluateSoftwareEngineering } = require('./softwareEngineeringEvaluator');

const EVALUATORS = new Map([
  ['creative_writing', evaluateCreativeWriting],
  ['fiction', evaluateCreativeWriting],
  ['scenario', evaluateCreativeWriting],
  ['script', evaluateCreativeWriting],
  ['software_engineering', evaluateSoftwareEngineering],
  ['code', evaluateSoftwareEngineering],
  ['programming', evaluateSoftwareEngineering]
]);

function inferDomainFromMission(mission) {
  const text = String(mission?.mission || mission?.prompt || mission || '').toLowerCase();
  const kind = String(mission?.workerKind || '').toLowerCase();
  if (kind === 'creative_worker' || /scénario|fiction|roman|nouvelle|chanson|dramaturgie|court métrage/i.test(text)) {
    return 'creative_writing';
  }
  if (kind === 'bounded_worker' || /code|patch|fonction|bug|refactor|test|implémente|script/i.test(text)) {
    return 'software_engineering';
  }
  return 'generic';
}

function evaluateGeneric(content, options = {}) {
  const text = typeof content === 'string' ? content : JSON.stringify(content || '');
  const defects = [];
  if (!text || text.trim().length < 20) {
    defects.push({
      code: 'EMPTY_OR_TRIVIAL_OUTPUT',
      severity: 'blocker',
      section: 'general',
      message: 'Livrable vide ou manifestement trop court.'
    });
  }
  const score = defects.length === 0 ? 80 : 20;
  const passed = defects.length === 0;
  return {
    domain: 'generic',
    score,
    overallScore: score,
    passed,
    valid: passed,
    threshold: options.threshold || 70,
    defects,
    metrics: { length: text.length },
    evaluatedAt: new Date().toISOString()
  };
}

function getEvaluator(domain) {
  const normalized = String(domain || '').toLowerCase().trim();
  return EVALUATORS.get(normalized) || evaluateGeneric;
}

function evaluateArtifact(domain, content, options = {}) {
  const resolvedDomain = domain || inferDomainFromMission(options.mission);
  const evaluator = getEvaluator(resolvedDomain);
  return evaluator(content, options);
}

module.exports = {
  getEvaluator,
  evaluateArtifact,
  evaluateContent: evaluateArtifact,
  inferDomainFromMission
};
