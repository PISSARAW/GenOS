'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { openDatabase } = require('./helpers/biologyDatabase');
const { SCHEMA, STATUSES } = require('../src/services/missionOutcomeContract');
const trust = require('../src/services/missionActionRuntimeTrust');
const provenance = require('../src/services/gvxMissionProvenance');
const runtime = require('../src/services/missionActionRuntimeService');
const modelRouter = require('../src/services/modelRouter');
const { handleAction } = require('../bin/orchestratorActions.cjs');

const KEY = 'mission-action-test-key-0123456789abcdef';
const CONTRACT = { schema: SCHEMA, goal: 'Verify the answer',
  obligations: [{ id: 'answer', statement: 'The answer is correct' }], statuses: [...STATUSES] };

async function fixture() {
  const db = openDatabase();
  await db.exec(`CREATE TABLE workspaces (id TEXT PRIMARY KEY, organization_id TEXT, project_id TEXT);
    CREATE TABLE agents (id TEXT PRIMARY KEY, workspace_id TEXT);
    CREATE TABLE strategy_contracts (id TEXT PRIMARY KEY, contract_json TEXT);
    CREATE TABLE strategy_execution_runs (id TEXT PRIMARY KEY, agent_id TEXT,
      contract_id TEXT, status TEXT, budget_json TEXT, metrics_json TEXT);
    INSERT INTO workspaces VALUES ('workspace-1', 'org-1', 'project-1');
    INSERT INTO agents VALUES ('agent-1', 'workspace-1');`);
  await db.run('INSERT INTO strategy_contracts VALUES (?, ?)', 'contract-1',
    JSON.stringify({ mission_outcome: CONTRACT }));
  await db.run('INSERT INTO strategy_execution_runs VALUES (?, ?, ?, ?, ?, ?)',
    'run-1', 'agent-1', 'contract-1', 'planned',
    JSON.stringify({ tokens: 100, costUsd: 1, latencyMs: 1000 }),
    JSON.stringify({ tokens: 0, costUsd: 0, latencyMs: 0 }));
  return db;
}

function action() {
  return { id: 'bounded-gate', kind: 'tool', covers: ['answer'],
    requiredEvidenceRefs: ['proof:holdout-1'],
    cost: { execution: { tokens: 2, usd: 0, latencyMs: 5 },
      verification: { tokens: 1, usd: 0, latencyMs: 5 }, maxRetries: 0 },
    execution: { primitive: 'uncertainty_gate', args: { uncertainty: 0.2, threshold: 0.5 } },
    calibrationReceipt: { probabilityVerified: { min: 0.8, max: 0.9 },
      evidenceRefs: ['proof:holdout-1'], issuer: 'local-test',
      validUntil: new Date(Date.now() + 60000).toISOString() } };
}

function signedAction(candidate) {
  const signature = crypto.createHmac('sha256', KEY).update(trust.attestationPayload({
    runId: 'run-1', missionId: 'mission-1', contract: CONTRACT, action: candidate
  })).digest('hex');
  candidate.calibrationReceipt.signature = `sha256:${signature}`;
  return candidate;
}

function request(mode, candidate) {
  return { executionRunId: 'run-1', agentId: 'agent-1', missionId: 'mission-1',
    decision: { mode, actions: [candidate], policy: {
      weights: { tokens: 1, usd: 0, latencyMs: 0 } } } };
}

async function testShadowAndActive() {
  const db = await fixture();
  const original = provenance.readRun;
  provenance.readRun = async () => ({ mission: { id: 'mission-1' },
    scope: { organizationId: 'org-1', projectId: 'project-1' } });
  try {
    const candidate = signedAction(action());
    const shadow = await runtime.run({ db, request: request('active', candidate),
      config: { active: false, key: KEY } });
    assert.equal(shadow.status, 'shadow');
    assert.equal(shadow.decision.selectedId, 'bounded-gate');
    assert.equal(shadow.executed, false);
    const executed = await runtime.run({ db, request: request('active', candidate),
      config: { active: true, key: KEY } });
    assert.equal(executed.status, 'executed_unverified');
    assert.equal(executed.result.allowed, true);
    assert.equal(executed.missionVerified, false);
    const rows = await db.all('SELECT mode, status, tokens FROM mission_action_decisions ORDER BY created_at');
    assert.equal(rows.length, 2);
    assert(rows.some((row) => row.mode === 'active' && row.tokens === 3));
    await assert.rejects(runtime.run({ db, request: request('active', candidate),
      config: { active: true, key: KEY } }), { code: 'MISSION_ACTION_DUPLICATE' });
  } finally { provenance.readRun = original; await db.close(); }
}

async function testTamperAndBinding() {
  const db = await fixture();
  try {
    const candidate = signedAction(action());
    candidate.execution.args.uncertainty = 0.9;
    const tampered = await runtime.run({ db, request: request('active', candidate),
      config: { active: false, key: KEY } });
    assert.equal(tampered.decision.selectedId, null);
    assert.equal(tampered.decision.alternatives[2].reason, 'authority_unverified');
    await assert.rejects(runtime.run({ db, request: request('active', signedAction(action())),
      config: { active: true, key: KEY } }), { code: 'MISSION_ACTION_BINDING_REQUIRED' });
  } finally { await db.close(); }
}

async function testBudgetAndActivationGates() {
  const db = await fixture();
  const original = provenance.readRun;
  provenance.readRun = async () => ({ mission: { id: 'mission-1' },
    scope: { organizationId: 'org-1', projectId: 'project-1' } });
  try {
    const candidate = signedAction(action());
    await assert.rejects(runtime.run({ db, request: request('active', candidate),
      config: { active: true } }), { code: 'MISSION_ACTION_ATTESTATION_REQUIRED' });
    await db.run('UPDATE strategy_execution_runs SET metrics_json = ? WHERE id = ?',
      JSON.stringify({ tokens: 99, costUsd: 0, latencyMs: 0 }), 'run-1');
    const blocked = await runtime.run({ db, request: request('active', candidate),
      config: { active: true, key: KEY } });
    assert.equal(blocked.status, 'need_evidence');
    assert.equal(blocked.decision.alternatives[2].reason, 'budget_exceeded');
    const rows = await db.all("SELECT id FROM mission_action_decisions WHERE mode = 'active'");
    assert.equal(rows.length, 0);
  } finally { provenance.readRun = original; await db.close(); }
}

async function testCliDispatch() {
  const db = await fixture();
  const original = provenance.readRun;
  const oldFlag = process.env.GENOS_MISSION_ACTION_ACTIVE;
  const oldKey = process.env.GENOS_MISSION_ACTION_ATTESTATION_KEY;
  const write = process.stdout.write;
  let output = '';
  provenance.readRun = async () => ({ mission: { id: 'mission-1' },
    scope: { organizationId: 'org-1', projectId: 'project-1' } });
  process.env.GENOS_MISSION_ACTION_ACTIVE = '1';
  process.env.GENOS_MISSION_ACTION_ATTESTATION_KEY = KEY;
  process.stdout.write = (chunk) => { output += String(chunk); return true; };
  try {
    const handled = await handleAction({ action: 'execute_mission_action', db,
      request: request('active', signedAction(action())), orchestratorId: 'agent-1' });
    assert.equal(handled, true);
    assert.equal(JSON.parse(output).status, 'executed_unverified');
  } finally {
    provenance.readRun = original;
    process.stdout.write = write;
    if (oldFlag === undefined) delete process.env.GENOS_MISSION_ACTION_ACTIVE;
    else process.env.GENOS_MISSION_ACTION_ACTIVE = oldFlag;
    if (oldKey === undefined) delete process.env.GENOS_MISSION_ACTION_ATTESTATION_KEY;
    else process.env.GENOS_MISSION_ACTION_ATTESTATION_KEY = oldKey;
    await db.close();
  }
}

async function testCliModelDispatch() {
  const db = await fixture();
  const readRun = provenance.readRun;
  const generate = modelRouter.generate;
  const oldFlag = process.env.GENOS_MISSION_ACTION_ACTIVE;
  const oldKey = process.env.GENOS_MISSION_ACTION_ATTESTATION_KEY;
  const write = process.stdout.write;
  let output = '';
  let routed = null;
  provenance.readRun = async () => ({ mission: { id: 'mission-1' },
    scope: { organizationId: 'org-1', projectId: 'project-1' } });
  modelRouter.generate = async (options) => {
    routed = options;
    return { text: 'candidate answer', inputTokens: 4, outputTokens: 3,
      costUsd: 0.03 };
  };
  process.env.GENOS_MISSION_ACTION_ACTIVE = '1';
  process.env.GENOS_MISSION_ACTION_ATTESTATION_KEY = KEY;
  process.stdout.write = (chunk) => { output += String(chunk); return true; };
  try {
    const candidate = action();
    candidate.id = 'model-answer';
    candidate.kind = 'small_model';
    candidate.cost.execution = { tokens: 20, usd: 0.2, latencyMs: 50 };
    candidate.execution = { prompt: 'Answer the bounded question', model: 'openai://example' };
    const handled = await handleAction({ action: 'execute_mission_action', db,
      request: request('active', signedAction(candidate)), orchestratorId: 'agent-1' });
    assert.equal(handled, true);
    assert.equal(routed.routeActionId, 'model-answer');
    assert.equal(routed.executionRunId, 'run-1');
    assert.equal(routed.organizationId, 'org-1');
    assert.equal(routed.projectId, 'project-1');
    assert.equal(JSON.parse(output).status, 'executed_unverified');
    const journal = await db.get('SELECT action_id, status FROM mission_action_decisions');
    assert.deepEqual(journal, { action_id: 'model-answer', status: 'executed_unverified' });
  } finally {
    provenance.readRun = readRun;
    modelRouter.generate = generate;
    process.stdout.write = write;
    if (oldFlag === undefined) delete process.env.GENOS_MISSION_ACTION_ACTIVE;
    else process.env.GENOS_MISSION_ACTION_ACTIVE = oldFlag;
    if (oldKey === undefined) delete process.env.GENOS_MISSION_ACTION_ATTESTATION_KEY;
    else process.env.GENOS_MISSION_ACTION_ATTESTATION_KEY = oldKey;
    await db.close();
  }
}

async function main() {
  await testShadowAndActive();
  await testTamperAndBinding();
  await testBudgetAndActivationGates();
  await testCliDispatch();
  await testCliModelDispatch();
  console.log('Mission action runtime tests passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
