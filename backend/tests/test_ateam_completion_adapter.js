'use strict';

const assert = require('node:assert/strict');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const runStore = require('../src/services/aTeam/teamRunStore');
const graphStore = require('../src/services/aTeam/workGraph/workGraphStore');
const { compileWorkGraph } = require('../src/services/aTeam/workGraph/workGraphCompiler');
const { evaluateQualityGate } = require('../src/services/aTeamQualityGateService');
const adapter = require('../src/services/topologyCompletionAdapters/aTeamAdapter');
const { closureInput } = require('../src/services/topologyCompletionAdapters/dossier');
const { closeMission } = require('../src/services/missionClosureService');

function members() {
  return [
    { memberId: 'member-build', workerId: 'worker-build', agentId: 'worker-build',
      role: 'builder', domain: 'build', capabilities: ['build'], outputs: ['artifact'] },
    { memberId: 'member-review', workerId: 'worker-review', agentId: 'worker-review',
      role: 'reviewer', domain: 'review', capabilities: ['review'], outputs: ['review'],
      dependsOn: ['build'] }
  ];
}

function coverage() {
  const metric = { numerator: 2, denominator: 2, ratio: 1,
    source: 'persisted_work_graph_and_worker_evidence' };
  return { missionCoverage: metric, staffedCoverage: metric,
    runtimeToolCoverage: metric, verifiedCoverage: metric,
    ratio: 1, covered: ['build', 'review'], uncovered: [] };
}

function observerReport() {
  return { role: 'integration_observer', failures: [], integrationFailures: [] };
}

function auditFor(teamMembers, refs) {
  return { complete: true,
    identities: teamMembers.map((member) => ({ workerId: member.workerId,
      memberId: member.memberId, role: member.role, subSystem: member.domain })),
    relationships: [], communications: [], errors: [],
    reports: teamMembers.map((member) => ({ workerId: member.workerId, promoted: true,
      reason: null, evidenceRefs: refs[member.workerId], report: {
        outcome: 'success', artifacts: member.outputs, claims: [{ evidence: refs[member.workerId] }] } })) };
}

async function database() {
  return open({ filename: ':memory:', driver: sqlite3.Database });
}

async function canonicalState(db, missionId = 'mission-a-team') {
  const teamMembers = members();
  const graph = compileWorkGraph({ workGraphId: 'graph-a-team', teamRunId: 'run-a-team', members: teamMembers });
  const refs = Object.fromEntries(teamMembers.map((member) => [member.workerId, [`evidence:${member.workerId}`]]));
  graph.nodes = graph.nodes.map((node) => ({ ...node, status: 'SUCCEEDED',
    evidenceRefs: refs[teamMembers.find((member) => member.memberId === node.memberId).workerId] }));
  graph.edges = graph.edges.map((edge) => ({ ...edge, available: true, accepted: true }));
  graph.status = 'SUCCEEDED';
  await graphStore.create(db, graph);
  const runtimeCoverage = coverage();
  const report = observerReport();
  const gate = { ...evaluateQualityGate({ capabilityCoverage: runtimeCoverage }, report),
    missingMissionCriteria: [] };
  const integration = { accepted: true, failures: { observerReport: report }, gate,
    audit: auditFor(teamMembers, refs), completion: { verdict: 'succeeded', success: true,
      closureChecks: { requiredWorkers: true, invariants: true, independentOracle: true, evidence: true } } };
  await runStore.create(db, { teamRunId: 'run-a-team', missionId, goal: 'Build and review',
    workGraphId: graph.workGraphId, members: teamMembers,
    requiredCapabilities: [{ name: 'build', weight: 1 }, { name: 'review', weight: 1 }],
    execution: { coverage: runtimeCoverage, integration }, status: 'COMPLETED', phase: 'DEBRIEF' });
  return { teamMembers, graph, integration };
}

async function dossier(db, missionId = 'mission-a-team') {
  const result = await adapter.build({ context: { db, missionId, mode: 'a_team',
    teamRunId: 'run-a-team', output: { status: 'completed' } }, evidence: {} });
  return closureInput(result);
}

async function mutateRun(db, mutator) {
  const run = await runStore.load(db, 'run-a-team');
  return runStore.update({ db, teamRunId: run.teamRunId, revision: run.revision,
    patch: mutator(structuredClone(run)) });
}

async function testAcceptedCanonicalRun() {
  const db = await database();
  try {
    await canonicalState(db);
    const result = closeMission(await dossier(db));
    assert.equal(result.verdict, 'succeeded', JSON.stringify(result));
    assert.deepEqual(result.closureChecks, { requiredWorkers: true, invariants: true,
      independentOracle: true, evidence: true });
  } finally { await db.close(); }
}

async function testForeignMissionFails() {
  const db = await database();
  try {
    await canonicalState(db, 'mission-foreign');
    const result = closeMission(await dossier(db));
    assert.equal(result.verdict, 'failed');
    assert.ok(result.reasons.includes('ateam_mission_scope_mismatch'));
  } finally { await db.close(); }
}

async function testMissingPhaseIsPartial() {
  const db = await database();
  try {
    await canonicalState(db);
    await mutateRun(db, () => ({ phase: 'INTEGRATION' }));
    const result = closeMission(await dossier(db));
    assert.equal(result.verdict, 'partial');
    assert.ok(result.reasons.includes('ateam_debrief_missing'));
  } finally { await db.close(); }
}

async function testMissingReviewIsPartial() {
  const db = await database();
  try {
    await canonicalState(db);
    await mutateRun(db, (run) => ({ execution: { ...run.execution,
      integration: { ...run.execution.integration, audit: null } } }));
    const result = closeMission(await dossier(db));
    assert.equal(result.verdict, 'partial');
    assert.ok(result.reasons.includes('ateam_integration_review_missing'));
  } finally { await db.close(); }
}

async function testAlteredReviewFails() {
  const db = await database();
  try {
    await canonicalState(db);
    await mutateRun(db, (run) => {
      const audit = structuredClone(run.execution.integration.audit);
      audit.reports[0].evidenceRefs = ['evidence:tampered'];
      return { execution: { ...run.execution,
        integration: { ...run.execution.integration, audit } } };
    });
    const result = closeMission(await dossier(db));
    assert.equal(result.verdict, 'failed');
    assert.ok(result.reasons.includes('ateam_review_evidence_mismatch'));
  } finally { await db.close(); }
}

async function main() {
  await testAcceptedCanonicalRun();
  await testForeignMissionFails();
  await testMissingPhaseIsPartial();
  await testMissingReviewIsPartial();
  await testAlteredReviewFails();
  console.log('A-Team completion adapter: canonical run, scope, phases and independent review passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
