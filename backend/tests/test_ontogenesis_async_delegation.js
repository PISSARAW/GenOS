'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { memoryDb } = require('./ontogenesisFixture');
const { createProject } = require('../src/services/ontogenesis/projectStore');
const { registerResponsibility } = require('../src/services/shev/responsibilityService');
const worktrees = require('../src/services/ontogenesis/worktreeService');
const planService = require('../src/services/ontogenesis/asyncDelegationPlanService');
const runtime = require('../src/services/ontogenesis/asyncDelegationRuntimeService');

async function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'onto-delegation-'));
  const db = await memoryDb();
  const projectId = 'delegated-project';
  await createProject(db, { id: projectId, rootPath: root,
    branch: 'codex/ontogenesis', objective: 'objectif historique non delegue' });
  await registerResponsibility(db, { projectId, authorityRef: 'owner://repository', mandate: {
    purpose: 'maintenir la compatibilite de l API',
    dimensions: [{ name: 'compatibility', expected: 'stable', acceptance: ['contract-test-passes'] }],
    autoDiagnose: true, autoInstrument: false
  } });
  const capsule = path.join(worktrees.managedRoot({ id: projectId, root_path: root }), 'capsules', 'mission-1');
  fs.mkdirSync(capsule, { recursive: true });
  return { db, root, projectId, capsule };
}

async function main() {
  const ctx = await fixture();
  const input = { missionId: 'mission-1', projectId: ctx.projectId,
    producerId: 'worker-jules', capsulePath: ctx.capsule, baseRevision: 'abc1234' };
  await assert.rejects(planService.deriveDelegation(ctx.db, input), /responsabilite-shev-non-deleguee/);
  await ctx.db.run("UPDATE shev_responsibilities SET stage = 'delegated' WHERE project_id = ?", [ctx.projectId]);

  const mission = await planService.deriveDelegation(ctx.db, input);
  assert.strictEqual(mission.plan.source.kind, 'shev_responsibility');
  assert.strictEqual(mission.plan.source.purpose, 'maintenir la compatibilite de l API');
  assert.deepStrictEqual(mission.plan.steps.map((step) => step.id),
    ['scope', 'execute_isolated', 'independent_verify', 'post_integration_effect']);
  assert.strictEqual(mission.mandate_version, 1);
  assert.strictEqual((await planService.deriveDelegation(ctx.db, input)).id, mission.id);
  await assert.rejects(planService.deriveDelegation(ctx.db, {
    ...input, missionId: 'mission-outside', capsulePath: ctx.root
  }), /capsule-hors-perimetre/);

  const first = await runtime.claimDelegation(ctx.db, {
    missionId: mission.id, owner: 'runtime-a', nowMs: 1000, ttlMs: 1000
  });
  assert.strictEqual(first.fence, 1);
  const concurrent = await runtime.claimDelegation(ctx.db, {
    missionId: mission.id, owner: 'runtime-b', nowMs: 1500, ttlMs: 1000
  });
  assert.strictEqual(concurrent.reason, 'bail-delegation-actif');
  const scope = await runtime.checkpointDelegation(ctx.db, {
    missionId: mission.id, owner: 'runtime-a', fence: 1, nowMs: 1600,
    sequence: 1, stepId: 'scope', state: { inspected: true }, evidenceRefs: ['evidence://scope']
  });
  assert.strictEqual(scope.sequence, 1);
  const replay = await runtime.checkpointDelegation(ctx.db, {
    missionId: mission.id, owner: 'runtime-a', fence: 1, nowMs: 1700,
    sequence: 1, stepId: 'scope', state: { inspected: true }, evidenceRefs: ['evidence://scope']
  });
  assert.strictEqual(replay.replayed, true);

  const resumed = await runtime.claimDelegation(ctx.db, {
    missionId: mission.id, owner: 'runtime-b', nowMs: 2100, ttlMs: 1000
  });
  assert.deepStrictEqual({ fence: resumed.fence, cursor: resumed.cursor }, { fence: 2, cursor: 1 });
  await assert.rejects(runtime.checkpointDelegation(ctx.db, {
    missionId: mission.id, owner: 'runtime-a', fence: 1, nowMs: 2200,
    sequence: 2, stepId: 'execute_isolated', state: {}
  }), /fencing-delegation-obsolete/);
  await runtime.checkpointDelegation(ctx.db, {
    missionId: mission.id, owner: 'runtime-b', fence: 2, nowMs: 2200,
    sequence: 2, stepId: 'execute_isolated', state: { revision: 'def5678' },
    artifactRef: 'artifact://candidate'
  });
  const interrupted = await runtime.interruptDelegation(ctx.db, {
    missionId: mission.id, owner: 'runtime-b', fence: 2, nowMs: 2300
  });
  assert.strictEqual(interrupted.cursor, 2);

  await ctx.db.close();
  fs.rmSync(ctx.root, { recursive: true, force: true });
  console.log('ontogenesis responsibility-derived async delegation plan checks passed.');
}

main().catch((error) => { console.error(error); process.exit(1); });
