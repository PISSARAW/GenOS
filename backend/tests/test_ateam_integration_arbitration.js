const assert = require('node:assert/strict');

process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || 'ateam-arbitration-test';

const { applyAteamIntegration, buildDossiers } = require('../src/services/aTeamComparativeBarrier');

const workers = [
  { agentId: 'w-front', name: 'Front', role: 'frontend_engineer', pipelineStage: 0 },
  { agentId: 'w-back', name: 'Back', role: 'backend_engineer', pipelineStage: 0 },
  { agentId: 'w-integ', name: 'Integ', role: 'integration_observer', pipelineStage: 1 }
];
const usable = [
  { workerId: 'w-front', events: [{ evidenceReport: { outcome: 'success', coverage: 0.9, claims: [{ statement: 'Frontend complete', evidence: ['build'] }], tests: [{ name: 'front', passed: true }] } }] },
  { workerId: 'w-back', events: [{ evidenceReport: { outcome: 'success', coverage: 0.6, claims: [{ statement: 'Backend complete', evidence: ['build'] }], tests: [{ name: 'back', passed: true }] } }] },
  { workerId: 'w-integ', events: [{ evidenceReport: { outcome: 'success', coverage: 0.7, claims: [{ statement: 'Integrated evidence', evidence: ['audit'] }], tests: [{ name: 'integ', passed: true }] } }] }
];

(async () => {
  const dossiers = buildDossiers(workers, usable);
  assert.equal(dossiers.length, 3);
  assert.ok(dossiers.every((dossier) => dossier.evidenceReport));
  assert.equal(dossiers[2].pipelineStage, 1);

  const autonomyPlan = { aTeam: { activated: true } };
  const arbitration = await applyAteamIntegration({ agentId: 'orch-ateam-test', workers, usable, autonomyPlan });
  assert.deepEqual(arbitration.paretoFront, []);
  assert.equal(arbitration.totalEvaluated, 0);
  assert.equal(autonomyPlan.aTeam.integration.canMerge, true);
  assert.equal(autonomyPlan.aTeam.integration.paretoScope, 'domain_local_alternatives_only');

  assert.equal(await applyAteamIntegration({ autonomyPlan: { aTeam: { activated: false } } }), null);
  console.log('A-Team integration arbitration is wired to the evidence barrier.');
})().catch((error) => { console.error(error); process.exit(1); });
