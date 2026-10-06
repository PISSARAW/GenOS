'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const fixture = require('./ontogenesisFixture');
const { runCommand } = require('../src/services/agentWorkspaceLifecycle/git');
const store = require('../src/services/ontogenesis/projectStore');
const workspaces = require('../src/services/ontogenesis/worktreeService');
const { tickOnce } = require('../src/services/ontogenesis/tickService');
const { registerResponsibility } = require('../src/services/shev/responsibilityService');
const { recordObservation } = require('../src/services/shev/observationService');
const { recordProjectEffect } = require('../src/services/shev/effectService');

function evidence(file) {
  return `file:sha256:${createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`;
}

async function observe(db, input) {
  return recordObservation(db, { id: input.id, projectId: input.projectId,
    domain: 'application', dimension: 'module', kind: input.kind,
    epistemicStatus: 'observed', source: 'executable-file-probe',
    observedAt: new Date(input.at).toISOString(), summary: input.summary,
    evidenceRefs: [evidence(input.file)] });
}

async function runUntilTaskDone(db, input) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await tickOnce(db, { projectId: input.projectId, owner: 'shev-demo', harness: input.harness });
    const task = await db.get(`SELECT b.status FROM shev_initiatives i JOIN ontogenesis_backlog b
      ON b.id = i.task_id WHERE i.project_id = ? AND i.observation_id = ?`,
    [input.projectId, input.observationId]);
    if (task?.status === 'done') return;
  }
  const diagnostics = { project: await store.getProject(db, input.projectId),
    tasks: await db.all('SELECT * FROM ontogenesis_backlog'),
    executions: await db.all('SELECT * FROM ontogenesis_execution') };
  throw new Error(`SHEV task did not complete for ${input.observationId}: ${JSON.stringify(diagnostics)}`);
}

async function verifyEffect(db, input) {
  await observe(db, { id: input.afterId, projectId: input.projectId, kind: 'state',
    at: input.at, file: input.file, summary: 'Module reteste apres integration' });
  const initiative = await db.get('SELECT id FROM shev_initiatives WHERE project_id = ? AND observation_id = ?',
    [input.projectId, input.beforeId]);
  return recordProjectEffect(db, { projectId: input.projectId, initiativeId: initiative.id,
    postObservationId: input.afterId, verify: async () => ({
      result: fs.readFileSync(input.file, 'utf8') === 'module.exports = "complete";\n' ? 'confirmed' : 'regressed',
      verifierRef: 'independent-file-read', evidenceRefs: [evidence(input.file)]
    }) });
}

async function main() {
  const db = await fixture.memoryDb();
  const root = await fixture.repository();
  try {
    const projectId = 'shev-demo';
    await store.createProject(db, { id: projectId, rootPath: root, branch: 'codex/ontogenesis',
      objective: 'garder le module fonctionnel', config: fixture.testConfig() });
    await registerResponsibility(db, { projectId, authorityRef: 'delegation:test-demo',
      mandate: { purpose: 'Garder le module fonctionnel', autoDiagnose: true, autoInstrument: false,
        dimensions: [{ name: 'module', expected: 'Le module exporte complete',
          acceptance: ['Le test du module passe sur le candidat integre.'] }] } });
    const harness = fixture.fakeHarness(db);
    const tick = () => tickOnce(db, { projectId, owner: 'shev-demo', harness });
    await tick();
    await tick();
    assert.strictEqual((await store.getProject(db, projectId)).state, 'IDLE');
    const file = path.join(root, 'app.js');
    assert.strictEqual(fs.readFileSync(file, 'utf8'), 'module.exports = "initial";\n');
    const firstAt = Date.now() - 20000;
    await observe(db, { id: 'initial-failure', projectId, kind: 'degradation',
      at: firstAt, file, summary: 'Le module ne respecte pas le contrat.' });
    await runUntilTaskDone(db, { projectId, observationId: 'initial-failure', harness });
    const integration = path.join(workspaces.managedRoot(await store.getProject(db, projectId)), 'integration', 'app.js');
    assert.strictEqual(fs.readFileSync(integration, 'utf8'), 'module.exports = "complete";\n');
    assert.strictEqual((await verifyEffect(db, { projectId, beforeId: 'initial-failure',
      afterId: 'initial-recheck', file: integration, at: Date.now() })).project_result, 'confirmed');

    const integrationRoot = path.dirname(integration);
    fs.writeFileSync(integration, 'module.exports = "invalid";\n');
    await runCommand('git', ['add', 'app.js'], { cwd: integrationRoot });
    await runCommand('git', ['commit', '-m', '[TEST] Simulate external regression'], { cwd: integrationRoot });
    const regressionAt = Date.now();
    await observe(db, { id: 'external-regression', projectId, kind: 'degradation',
      at: regressionAt, file: integration, summary: 'Regression du module.' });
    await runUntilTaskDone(db, { projectId, observationId: 'external-regression', harness });
    const recovery = await verifyEffect(db, { projectId, beforeId: 'external-regression',
      afterId: 'recovery-recheck', file: integration, at: Date.now() + 1000 });
    assert.strictEqual(recovery.project_result, 'confirmed');
    assert.strictEqual(recovery.agent_result, 'not_tested');
    assert.strictEqual(harness.launches, 2);
    console.log('SHEV runtime demo passed (repair, regression, recovery, independent file read).');
  } finally {
    await db.close();
    const resolved = fs.realpathSync(root);
    if (path.dirname(resolved) !== fs.realpathSync(os.tmpdir())) throw new Error('Test cleanup escaped temp directory.');
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
