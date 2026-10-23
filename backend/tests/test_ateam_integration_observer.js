const assert = require('node:assert/strict');

process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || 'ateam-observer-test';

const { observeAteamIntegration } = require('../src/services/aTeamIntegrationObserver');
const { applyAteamIntegration } = require('../src/services/aTeamComparativeBarrier');

const members = [
  { label: 'frontend', capabilities: ['frontend'], role: 'frontend_engineer', dependsOn: [] },
  { label: 'security', capabilities: ['security'], role: 'security_reviewer', dependsOn: [] },
  { label: 'integration', capabilities: ['integration'], role: 'integration_observer', dependsOn: ['frontend', 'security'] }
];
const workers = [
  { agentId: 'w1', role: 'frontend_engineer' },
  { agentId: 'w2', role: 'security_reviewer' },
  { agentId: 'w3', role: 'integration_observer' }
];
const report = (statement, extra = {}) => ({ evidenceReport: { outcome: 'success', claims: [{ statement, evidence: ['build'] }], ...extra } });
const clean = [
  { workerId: 'w1', events: [report('React component tree')] },
  { workerId: 'w2', events: [report('OAuth token validation')] },
  { workerId: 'w3', events: [report('Integrated evidence', { integrationConstraints: ['frontend must expose /me'] })] }
];

(async () => {
  const ok = observeAteamIntegration({ members, workers, dossiers: clean });
  assert.deepEqual(ok.failures, []);
  assert.deepEqual(ok.integrationFailures, []);

  const autonomousPlan = { aTeam: { activated: true, members } };
  const arbitration = await applyAteamIntegration({ agentId: 'orch-observer-test', workers, usable: clean, autonomyPlan: autonomousPlan });
  assert.equal(arbitration.canMerge, true);
  assert.equal(autonomousPlan.aTeam.integration.canMerge, true);
  assert.deepEqual(autonomousPlan.aTeam.integration.failures, []);

  // Contamination: a frontend worker claiming security work.
  const contaminated = [ { workerId: 'w1', events: [report('OAuth token validation')] }, clean[1], clean[2] ];
  const bad = observeAteamIntegration({ members, workers, dossiers: contaminated });
  assert.equal(bad.failures[0].code, 'WORKER_DOMAIN_CONTAMINATION');
  assert.equal(bad.failures[0].foreign, 'security');

  const contaminatedPlan = { aTeam: { activated: true, members } };
  await applyAteamIntegration({ agentId: 'orch-observer-test', workers, usable: contaminated, autonomyPlan: contaminatedPlan });
  assert.equal(contaminatedPlan.aTeam.integration.canMerge, false);
  assert.equal(contaminatedPlan.aTeam.integration.failures[0].code, 'WORKER_DOMAIN_CONTAMINATION');

  // Missing integration constraints on the consumer.
  const upstreamCommit = 'git:' + 'a'.repeat(40);
  const handoffMembers = [
    { agentId: 'quality-worker', memberId: 'member-quality', label: 'quality', role: 'quality_engineer', dependsOn: [] },
    { agentId: 'security-worker', memberId: 'member-security', label: 'security', role: 'security_reviewer', dependsOn: ['quality'] }
  ];
  const handoffWorkers = handoffMembers.map((member) => ({ agentId: member.agentId, role: member.role }));
  const upstreamArtifacts = [upstreamCommit, 'src/site.js', 'test/public-contract.cjs'];
  const handoffReport = { outcome: 'success', artifacts: upstreamArtifacts, claims: [{ statement: 'Reviewed the received commit.', evidence: ['review-proof'] }],
    integrationConstraints: ['Preserve the upstream interface.'], tests: [{ passed: true, evidenceRefs: ['review-proof'] }],
    handoffEvaluations: [{ handoffId: 'work:member-quality:0->work:member-security:0:1', digest: 'b'.repeat(64), version: 1, passed: true, evidenceRefs: ['review-proof'] }] };
  const handoffDossiers = [
    { workerId: 'quality-worker', events: [report('Implemented the required patch.', { artifacts: upstreamArtifacts })] },
    { workerId: 'security-worker', events: [report('Reviewed the security boundary.', handoffReport)] }
  ];
  handoffDossiers[1].events[0].evidenceReport.artifacts = [
    { uri: upstreamArtifacts[0], sha256: 'a'.repeat(64) },
    { uri: upstreamArtifacts[0], sha256: 'a'.repeat(64) },
    { uri: upstreamArtifacts[1], sha256: 'b'.repeat(64) },
    { uri: upstreamArtifacts[2], sha256: 'c'.repeat(64) }
  ];
  const inherited = observeAteamIntegration({ members: handoffMembers, workers: handoffWorkers, dossiers: handoffDossiers });
  assert.equal(inherited.failures.some((failure) => failure.code === 'DUPLICATE_ARTIFACT_OWNERSHIP'), false,
    'a verified consumer handoff does not claim ownership of the upstream Git commit');
  handoffDossiers[1].events[0].evidenceReport.handoffEvaluations[0].passed = false;
  const unaccepted = observeAteamIntegration({ members: handoffMembers, workers: handoffWorkers, dossiers: handoffDossiers });
  assert.equal(unaccepted.failures.some((failure) => failure.code === 'DUPLICATE_ARTIFACT_OWNERSHIP'), true,
    'an unaccepted duplicate artifact remains an ownership violation');

  const noConstraints = [ clean[0], clean[1], { workerId: 'w3', events: [report('Integrated evidence')] } ];
  const missing = observeAteamIntegration({ members, workers, dossiers: noConstraints });
  assert.equal(missing.integrationFailures[0].code, 'WORKER_INTEGRATION_CONSTRAINT_MISSING');
  assert.equal(missing.observerReport.integrationFailures.length, 1);

  console.log('A-Team integration observer reports contamination and missing constraints, gating canMerge.');
})().catch((error) => { console.error(error); process.exit(1); });
