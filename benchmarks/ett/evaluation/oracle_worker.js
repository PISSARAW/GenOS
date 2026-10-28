'use strict';

let input = '';
const { evaluateDomain } = require('./domainChecks');
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => process.stdout.write(JSON.stringify(JSON.parse(input).map(verify))));

function verify(inputRow) {
  const { expected, proposal } = inputRow;
  const domain = expected.requireInteraction ? evaluateDomain(expected, proposal) : { passed: true, metrics: {} };
  const valid = proposal && proposal.answerId === expected.answerId
    && validEvidence(expected, proposal) && validInteraction(expected, proposal) && domain.passed;
  return { verdict: valid ? 'supported' : 'refuted', usefulDiscoveries: valid ? 1 : 0,
    domainMetrics: domain.metrics, domainChecksPassed: domain.passed };
}

function validEvidence(expected, proposal) {
  const refs = proposal?.evidenceRefs;
  if (!Array.isArray(refs)) return false;
  return expected.requireInspection ? refs.includes(`candidate:${proposal.answerId}:inspection`) : refs.length > 0;
}

function validInteraction(expected, proposal) {
  if (!expected.requireInteraction) return true;
  return expected.requiredActionRefs?.every((reference) => proposal?.evidenceRefs?.includes(reference)) === true;
}
