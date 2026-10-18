'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { createFabric, migrateGqwf } = require('../src/services/gqwf');
const missionExecution = require('../src/services/gqwf/missionExecution');
const rollout = require('../src/services/gqwf/rollout');
const { provisionMissionWorkspace } = require('../src/services/agentWorkspaceLifecycleService');

function canaryMission(workspacePath, overrides = {}) {
  return {
    agentId: 'canary-agent',
    organizationId: 'org-canary',
    projectId: 'project-canary',
    workspaceId: 'ws-canary',
    workspaceRoot: workspacePath,
    executionPolicy: {
      allowFileEdits: true,
      gqwfCanary: { enabled: true, policyId: 'rollout-2026-10', basisPoints: 10000 }
    },
    ...overrides
  };
}

async function fixture() {
  const parent = path.resolve(__dirname, '../../.genos-agent-worlds/gqwf-canary-tests');
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'canary-'));
  const workspacePath = path.join(root, 'workspace');
  await fs.mkdir(workspacePath);
  await fs.writeFile(path.join(workspacePath, 'source.txt'), 'source');
  const db = await open({ filename: path.join(root, 'state.sqlite'), driver: sqlite3.Database });
  await db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE workspaces (
      id TEXT PRIMARY KEY, path TEXT NOT NULL,
      organization_id TEXT, project_id TEXT
    );`);
  await db.run(`INSERT INTO workspaces (id, path, organization_id, project_id)
    VALUES (?, ?, ?, ?)`, 'ws-canary', workspacePath, 'org-canary', 'project-canary');
  await migrateGqwf(db);
  return { parent, root, workspacePath, db };
}

function context(state, runId, mission) {
  return {
    db: state.db,
    agentId: `agent-${runId}`,
    executable: 'codex',
    executionRun: { id: runId },
    dispatchedAgent: { execution_mode: 'orchestrator', workspace_id: 'ws-canary' },
    normalizedMission: mission
  };
}

function verifyRouting(state) {
  const first = rollout.routeMission(canaryMission(state.workspacePath), { disabled: false });
  const second = rollout.routeMission(canaryMission(state.workspacePath,
    { prompt: 'another mission' }), { disabled: false });
  assert.equal(first.executionPolicy.gqwfV2, true);
  assert.equal(first.gqwfRollout.arm, 'canary');
  assert.equal(first.gqwfRollout.bucket, second.gqwfRollout.bucket);
  assert.equal(first.gqwfRollout.basisHash, second.gqwfRollout.basisHash);
  assert.strictEqual(rollout.routeMission(first, { disabled: true }), first);

  const stopped = rollout.routeMission(canaryMission(state.workspacePath), { disabled: true });
  assert.equal(stopped.executionPolicy.gqwfV2, false);
  assert.equal(stopped.gqwfRollout.arm, 'control');
  assert.equal(stopped.gqwfRollout.disabledReason, 'operator_kill_switch');

  const disabled = canaryMission(state.workspacePath);
  disabled.executionPolicy.gqwfCanary.enabled = false;
  const control = rollout.routeMission(disabled, { disabled: false });
  assert.equal(control.gqwfRollout.disabledReason, 'policy_disabled');
  assert.equal(control.executionPolicy.gqwfV2, false);

  const manual = { executionPolicy: { gqwfV2: true } };
  assert.strictEqual(rollout.routeMission(manual, { disabled: true }), manual);
  assert.throws(() => rollout.routeMission({ ...canaryMission(state.workspacePath),
    executionPolicy: { ...canaryMission(state.workspacePath).executionPolicy, gqwfV2: true }
  }), /cannot be requested together/);
  assert.throws(() => rollout.routeMission({
    workspaceId: 'ws-canary', organizationId: 'org-canary',
    executionPolicy: { gqwfCanary: { enabled: true, policyId: '', basisPoints: 0 } }
  }), /basisPoints/);
}

async function verifyProvisioning(state) {
  const provisioned = await provisionMissionWorkspace(canaryMission(state.workspacePath), 'orchestrator');
  assert.equal(provisioned.executionPolicy.gqwfV2, true);
  assert.equal(provisioned.gqwfRollout.arm, 'canary');
  assert.equal(provisioned.workspaceRoot, state.workspacePath);
  assert.equal(provisioned.gqwfSourceWorkspaceRoot, state.workspacePath);
}

async function verifyCompletedCanary(state) {
  const mission = rollout.routeMission(canaryMission(state.workspacePath), { disabled: false });
  const prepared = await missionExecution.prepareMissionWorkspace(
    context(state, 'run-canary-completed', mission));
  assert.equal(prepared.state, 'materialized');
  await fs.writeFile(path.join(prepared.path, 'result.txt'), 'candidate');
  const finalized = await missionExecution.finalizeMissionWorkspace({
    db: state.db, executionRunId: 'run-canary-completed', outcomeStatus: 'completed'
  });
  assert.equal(finalized.outcome, 'completed');
}

async function verifyControlAndFailure(state) {
  const control = rollout.routeMission(canaryMission(state.workspacePath), { disabled: true });
  assert.equal(await missionExecution.prepareMissionWorkspace(
    context(state, 'run-control', control)), null);

  const invalid = rollout.routeMission(canaryMission(path.join(state.root, 'wrong')), {
    disabled: false
  });
  await assert.rejects(missionExecution.prepareMissionWorkspace(
    context(state, 'run-canary-failed', invalid)), /registered source/);
}

async function verifyInspection(state) {
  const report = await createFabric(state.db).inspectRollout({
    workspaceId: 'ws-canary', policyId: 'rollout-2026-10'
  });
  assert.deepEqual(report.summary, {
    total: 3,
    arms: { control: 1, canary: 2 },
    statuses: { assigned: 1, prepared: 0, completed: 1, failed: 1 },
    canaryFailureRate: 0.5
  });
  assert.deepEqual(report.decisions.map((decision) => decision.status).sort(),
    ['assigned', 'completed', 'failed']);
}

async function main() {
  const state = await fixture();
  try {
    verifyRouting(state);
    await verifyProvisioning(state);
    await verifyCompletedCanary(state);
    await verifyControlAndFailure(state);
    await verifyInspection(state);
    console.log('GQWF bounded canary rollout checks passed.');
  } finally {
    await state.db.close();
    if (path.dirname(state.root) !== state.parent
      || !path.basename(state.root).startsWith('canary-')) {
      throw new Error('Refusing to remove an unmanaged GQWF canary fixture.');
    }
    await fs.rm(state.root, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
