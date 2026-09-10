const assert = require('assert');
const { analyzeMission } = require('../src/services/aTeamService');
const { evaluateQualityGate, buildEvidence } = require('../src/services/aTeamQualityGateService');

const analysis = analyzeMission('Construire une interface React, une API Express et sécuriser OAuth avec des tests.');
assert.equal(analysis.capabilityCoverage.coveredSum, 5);
assert.equal(analysis.capabilityCoverage.requiredSum, 6);
assert.equal(analysis.capabilityCoverage.ratio, 0.833);
assert.equal(evaluateQualityGate(analysis).passed, true);

const blocked = evaluateQualityGate(analyzeMission('Construire une interface React et une API Express.'), {
  integrationFailures: [{ code: 'CONTRACT_MISMATCH', message: 'API contract diverged' }]
});
assert.equal(blocked.passed, false);
assert.equal(blocked.integration.failed, true);
assert.equal(buildEvidence({ mission: 'test', analysis, gate: blocked }).schema, 'genos.ateam-quality-gate/v1');
console.log('A-Team quality gate checks passed.');