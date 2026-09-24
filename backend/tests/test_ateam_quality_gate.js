const assert = require('assert');
const { analyzeMission } = require('../src/services/aTeamService');
const { evaluateQualityGate, buildEvidence } = require('../src/services/aTeamQualityGateService');

const analysis = analyzeMission('Construire une interface React, une API Express et sécuriser OAuth avec des tests.');
assert.equal(analysis.capabilityCoverage.coveredSum, 4);
assert.equal(analysis.capabilityCoverage.requiredSum, 4);
assert.equal(analysis.capabilityCoverage.ratio, 1);
assert.deepEqual(analysis.capabilityCoverage.missionCoverage.ratio, 1);
assert.equal(evaluateQualityGate(analysis).passed, false);
assert.deepEqual(evaluateQualityGate(analysis).coverage.failedDimensions.map((item) => item.name), ['runtimeToolCoverage', 'verifiedCoverage']);

const blocked = evaluateQualityGate(analyzeMission('Construire une interface React et une API Express.'), {
  integrationFailures: [{ code: 'CONTRACT_MISMATCH', message: 'API contract diverged' }]
});
assert.equal(blocked.passed, false);
assert.equal(blocked.integration.failed, true);

const blockedVariant = evaluateQualityGate(analysis, {
  role: 'integration',
  failure: { code: 'INTEGRATION_BROKEN', message: 'Modules diverged' }
});
assert.equal(blockedVariant.passed, false);
assert.equal(blockedVariant.integration.failed, true);

assert.equal(buildEvidence({ mission: 'test', analysis, gate: blocked }).schema, 'genos.ateam-quality-gate/v1');
console.log('A-Team quality gate checks passed.');
