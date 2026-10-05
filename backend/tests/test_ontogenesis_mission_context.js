'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { compileMission, classifyMission } = require('../src/services/ontogenesis/missionContextService');
const { requestFor } = require('../src/services/ontogenesis/runtimeHarness');
const { buildMissionCapabilityPlan } = require('../src/services/ontogenesis/missionCapabilityPlanService');
const fixture = require('./ontogenesisFixture');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'onto-context-'));
try {
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    dependencies: { react: '^18.0.0', vite: '^5.0.0' },
    scripts: { dev: 'vite', build: 'vite build', test: 'vitest run' }
  }));
  fs.mkdirSync(path.join(root, 'src'));
  const project = { root_path: root, objective: 'Créer le site React de réservation' };
  const compiled = compileMission(project);
  assert.strictEqual(compiled.kind, 'implement');
  assert.ok(compiled.profile.stack.includes('react'));
  assert.ok(compiled.capabilities.includes('verify'));
  assert.strictEqual(compiled.morphology.selectedTopology, 'a_team');
  assert.strictEqual(compiled.morphology.selectionReason, 'implementation-structuree');
  assert.ok(compiled.morphology.graph.graphId);
  assert.ok(compiled.capabilityCatalog.length > 0);
  assert.strictEqual(compiled.concepts.strategy.id, 'minimal_patch');
  const request = requestFor({ id: 'run-1', project, task: { title: 'implementer', acceptance_json: '[]', id: 'task-1' },
    selection: { topology: 'a_team', variant: 'default', workerRoles: ['sub_orchestrator', 'specialist'] }, worktree: root,
    budgets: { seconds: 10, tokens: 1, usd: 0 }, config: {}, mission: compiled });
  assert.strictEqual(request.projectId, undefined);
  assert.strictEqual(request.organization, compiled.morphology.selectedOrganization || undefined);
  assert.deepStrictEqual(request.capabilityContract.required, compiled.capabilities);
  assert.ok(request.conceptResolution.domains.includes('orchestration'));
  assert.strictEqual(request.conceptResolution.failClosed, true);
  assert.strictEqual(request.developmentalContext, null);
  assert.match(request.mission, /Developmental context: unavailable/);
  assert.match(request.mission, /Strategy concept:/);
  assert.strictEqual(request.worker_assignments.specialist.workerKind, 'specialist');
  const plan = buildMissionCapabilityPlan({ project: { id: 'project-1' }, task: { id: 'task-1', acceptance_json: '[]' },
    mission: compiled, config: { budgets: { tokens: 10 }, authority: {} }, selection: { topology: 'a_team', variant: 'default' } });
  assert.strictEqual(plan.failClosed, true);
  assert.strictEqual(plan.evidence.independent, true);
  assert.strictEqual(plan.recovery.rollback, true);
  assert.strictEqual(compiled.tasks.length, 3);
  assert.strictEqual(compiled.tasks[1].dependsOn.length, 0);
  assert.strictEqual(classifyMission('Réparer la régression', compiled.profile), 'repair');
  assert.strictEqual(compileMission({ root_path: root, objective: 'Explorer les branches distribuées' }).morphology.selectedTopology, 'rhizome');
  assert.strictEqual(compileMission({ root_path: root, objective: 'Vérifier les résultats' }).morphology.selectedTopology, 'trinity');
  assert.strictEqual(compileMission({ root_path: root, objective: 'Réparer après un crash' }).morphology.selectedTopology, 'metapopulation');
  assert.ok(compileMission({ root_path: root, objective: 'Réparer après un crash' }).capabilities.includes('verify'));
  assert.ok(compileMission({ root_path: root, objective: 'Décider entre deux stratégies' }).capabilities.includes('coordinate'));
  const invalid = compileMission({ root_path: root, config_json: JSON.stringify({ topology: 'unknown' }), objective: 'Mission configuree' });
  assert.strictEqual(invalid.morphology.selectedTopology, null);
  assert.strictEqual(invalid.morphology.error, 'topologie-configuree-inconnue');
  console.log('ontogenesis mission context checks passed.');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

async function integration() {
  const db = await fixture.memoryDb();
  const repository = await fixture.repository();
  try {
    const store = require('../src/services/ontogenesis/projectStore');
    const projectId = await store.createProject(db, {
      rootPath: repository, branch: 'codex/ontogenesis', objective: 'Créer une application web', config: fixture.testConfig()
    });
    const { tickOnce } = require('../src/services/ontogenesis/tickService');
    await tickOnce(db, { projectId, owner: 'context-test' });
    const tasks = await store.listTasks(db, projectId);
    assert.strictEqual(tasks.length, 3);
    assert.strictEqual(JSON.parse(tasks[1].depends_on_json)[0], tasks[0].id);
    assert.strictEqual(JSON.parse(tasks[2].depends_on_json)[0], tasks[1].id);
    console.log('ontogenesis mission context integration passed.');
  } finally {
    await db.close();
    fs.rmSync(repository, { recursive: true, force: true });
  }
}

integration().catch((error) => { console.error(error); process.exitCode = 1; });
