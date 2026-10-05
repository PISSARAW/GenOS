'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const fixture = require('./ontogenesisFixture');
const store = require('../src/services/ontogenesis/projectStore');
const claims = require('../src/services/ontogenesis/claimService');
const control = require('../src/services/ontogenesis/controlService');
const { tickOnce } = require('../src/services/ontogenesis/tickService');

async function claimsAfterCrash(db, id) {
  const dead = await claims.acquireClaim(db, { projectId: id, owner: 'dead', ttlMs: -60000 });
  const next = await claims.acquireClaim(db, { projectId: id, owner: 'new' });
  assert.strictEqual(next.acquired, true);
  await claims.releaseClaim(db, { projectId: id, owner: 'dead', operationId: dead.operationId });
  assert.strictEqual((await db.get('SELECT owner FROM ontogenesis_claims WHERE project_id = ?', [id])).owner, 'new');
  assert.strictEqual((await claims.acquireClaim(db, { projectId: id, owner: 'new' })).acquired, false);
  await claims.releaseClaim(db, { projectId: id, owner: 'new', operationId: next.operationId });
}

function rejectInvalidCandidates() {
  const integration = require('../src/services/ontogenesis/integrationService');
  const authority = { branches: ['codex/ontogenesis'], paths: ['backend/src/'] };
  const candidate = { branch: 'codex/ontogenesis', baseSha: 'abc', treeHash: 'a'.repeat(64), files: ['backend/src/../../outside.js'], proofs: [{}] };
  const result = integration.validateCandidate({ candidate, authority });
  assert.ok(result.errors.includes('chemin-hors-perimetre:backend/src/../../outside.js'));
  assert.ok(result.errors.includes('preuve-invalide'));
  candidate.files = ['backend/src/a.js'];
  candidate.proofs = [{ source: 'ontogenesis-verifier', exitCode: 1, command: 'npm test', treeHash: candidate.treeHash, completedAt: new Date().toISOString() }];
  assert.strictEqual(integration.validateCandidate({ candidate, authority }).ok, false);
  const auth = require('../src/services/ontogenesis/authorizationService');
  assert.strictEqual(auth.isPathAllowed({ paths: ['src'] }, 'src-extra/a.js'), false);
  assert.strictEqual(auth.isPathAllowed({ paths: ['*'] }, 'C:\\outside.js'), false);
}

async function stopAndPause(db, project) {
  const harness = fixture.fakeHarness(db);
  const tick = () => tickOnce(db, { projectId: project.id, owner: 'test', harness });
  harness.live = true;
  await tick();
  await tick();
  await control.pauseProject(db, { projectId: project.id });
  assert.strictEqual((await tick()).state, 'PAUSED');
  assert.strictEqual(harness.stops, 1);
  const run = await db.get('SELECT * FROM ontogenesis_execution WHERE project_id = ?', [project.id]);
  await require('../src/services/ontogenesis/executionStore').updateExecution(db, { id: run.id, phase: 'finished', result: { success: true } });
  assert.strictEqual((await db.get('SELECT phase FROM ontogenesis_execution WHERE id = ?', [run.id])).phase, 'suspended');
  assert.strictEqual((await tick()).state, 'PAUSED');
  await control.stopProject(db, { projectId: project.id });
  assert.strictEqual((await tick()).state, 'STOPPED');
  assert.strictEqual((await tick()).state, 'STOPPED');
  assert.strictEqual((await control.getControl(db, project.id)).mode, 'stopped');
}

async function missionSettlement(db) {
  const completion = require('../src/services/ontogenesis/missionCompletion');
  assert.deepStrictEqual(completion.verifyEvidenceContract({ requiresEvidenceBeforePromotion: true }, { context: { evidence: [] } }), { allowed: false, reason: 'evidence-independante-requise' });
  assert.strictEqual(completion.verifyEvidenceContract({ requiresEvidenceBeforePromotion: false }, { context: { evidence: [] } }), null);
  assert.strictEqual(completion.settled([]), false);
  assert.strictEqual(completion.settled([{ status: 'completed', runtime_pid: 42 }]), false);
  await db.exec('CREATE TABLE agents (id TEXT PRIMARY KEY, parent_agent_id TEXT, status TEXT, runtime_pid INTEGER)');
  await db.run("INSERT INTO agents VALUES ('root', NULL, 'completed', NULL), ('child', 'root', 'running', 42)");
  assert.strictEqual(completion.settled(await completion.missionAgents(db, 'root')), false);
  const timer = setTimeout(() => { db.run("UPDATE agents SET status = 'completed', runtime_pid = NULL WHERE id = 'child'").catch(() => {}); }, 50);
  try {
    const agents = await completion.waitForMission(db, { id: 'root', timeoutMs: 2000 }, { stopped: () => false });
    assert.strictEqual(agents.length, 2);
    assert.strictEqual(completion.settled(agents), true);
  } finally { clearTimeout(timer); }
}

async function memoryRecovery(db, root) {
  const project = await fixture.project(db, root);
  const harness = fixture.fakeHarness(db);
  const tick = () => tickOnce(db, { projectId: project.id, owner: 'test', harness });
  harness.freePct = 0.1;
  await tick();
  assert.strictEqual((await store.getProject(db, project.id)).state, 'SLEEPING_RESOURCE');
  harness.freePct = 0.3;
  assert.strictEqual((await tick()).state, 'SLEEPING_RESOURCE');
  harness.freePct = 0.4;
  assert.strictEqual((await tick()).state, 'PLANNING');
  harness.ownedMb = 3000;
  assert.strictEqual((await tick()).state, 'SLEEPING_RESOURCE');
  assert.strictEqual(harness.launches, 0);
}

async function budgetExhaustion(db, root) {
  const project = await fixture.project(db, root);
  await db.run('INSERT INTO ontogenesis_spend (project_id, tokens, usd, seconds) VALUES (?, 140000, 1, 300)', [project.id]);
  const harness = fixture.fakeHarness(db);
  const tick = () => tickOnce(db, { projectId: project.id, owner: 'test', harness });
  await tick();
  assert.strictEqual((await tick()).state, 'WAITING_INPUT');
  assert.strictEqual(harness.launches, 0);
}

async function main() {
  rejectInvalidCandidates();
  const db = await fixture.memoryDb();
  const root = await fixture.repository();
  try {
    const project = await fixture.project(db, root);
    await claimsAfterCrash(db, project.id);
    await stopAndPause(db, project);
    await memoryRecovery(db, root);
    await budgetExhaustion(db, root);
    await missionSettlement(db);
  } finally {
    await db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
  console.log('ontogenesis regression checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
