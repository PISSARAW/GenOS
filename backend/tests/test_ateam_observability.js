const assert = require('node:assert/strict');

process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || 'ateam-observability-test';

const { applyAteamIntegration } = require('../src/services/aTeamComparativeBarrier');

const members = [
  { label: 'frontend', capabilities: ['frontend'], role: 'frontend_engineer', dependsOn: [] },
  { label: 'backend', capabilities: ['backend'], role: 'backend_engineer', dependsOn: [] },
  { label: 'integration', capabilities: ['integration'], role: 'integration_observer', dependsOn: ['frontend', 'backend'] }
];
const workers = [
  { agentId: 'w1', role: 'frontend_engineer' },
  { agentId: 'w2', role: 'backend_engineer' },
  { agentId: 'w3', role: 'integration_observer' }
];
const report = (statement, extra = {}) => ({ evidenceReport: { outcome: 'success', claims: [{ statement, evidence: ['build'] }], ...extra } });
const clean = [
  { workerId: 'w1', events: [report('React component tree')] },
  { workerId: 'w2', events: [report('Express API routes')] },
  { workerId: 'w3', events: [report('Integrated evidence', { integrationConstraints: ['frontend must expose /me'] })] }
];

(async () => {
  const aTeam = { activated: true, members, capabilityCoverage: { ratio: 1 } };
  await applyAteamIntegration({ agentId: 'orch-metrics-test', workers, usable: clean, autonomyPlan: { aTeam } });
  assert.equal(aTeam.metrics.fusionDecision, 'merged');
  assert.equal(aTeam.metrics.integrationConstraintViolations, 0);
  assert.deepEqual(aTeam.metrics.memberActivationOrder, ['frontend', 'backend', 'integration']);
  assert.equal(aTeam.metrics.analysisFit, 1);
  assert.equal(aTeam.metrics.memberCount, 3);

  // A frontend worker claiming backend work escalates the fusion.
  const contaminated = [ { workerId: 'w1', events: [report('Express API routes')] }, clean[1], clean[2] ];
  const escalated = { activated: true, members, capabilityCoverage: { ratio: 1 } };
  await applyAteamIntegration({ agentId: 'orch-metrics-test', workers, usable: contaminated, autonomyPlan: { aTeam: escalated } });
  assert.equal(escalated.metrics.fusionDecision, 'escalated');
  assert.ok(escalated.metrics.integrationConstraintViolations >= 1);

  console.log('A-Team fusion exposes the documented observability metrics.');
})().catch((error) => { console.error(error); process.exit(1); });
