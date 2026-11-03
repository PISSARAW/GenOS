'use strict';
const { evaluateCreativeWriting } = require('./creativeWritingEvaluator');
const { evaluateSoftwareEngineering } = require('./softwareEngineeringEvaluator');
const { inferDomain } = require('./qualityContract');
const { textOf, defect, structuralResult } = require('./qualityText');
function evaluateGeneric(content) {
  const text = textOf(content);
  return structuralResult('generic', text, { defects: text.trim() ? []
    : [defect('EMPTY_ARTIFACT', 'Livrable absent.', { severity: 'blocker' })], metrics: { length: text.length } });
}
function getEvaluator(domain) {
  domain = String(domain || '').toLowerCase().trim();
  if (['creative_writing', 'fiction', 'scenario', 'screenplay', 'script'].includes(domain)) return evaluateCreativeWriting;
  if (['software_engineering', 'code', 'programming'].includes(domain)) return evaluateSoftwareEngineering;
  return evaluateGeneric;
}
function evaluateArtifact(domain, content, options = {}) { return getEvaluator(domain || inferDomain(options.mission))(content, options); }
module.exports = { getEvaluator, evaluateArtifact, evaluateContent: evaluateArtifact, inferDomainFromMission: inferDomain };
