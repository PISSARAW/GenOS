'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_GVX_LEDGER_HMAC_SECRET = 'mission-actions-native-tests';
process.env.NODE_ENV = 'test';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const f = require('./helpers/missionActionsFixture');
const runtime = require('../src/services/missionActionRuntimeService');
const { handleAction } = require('../bin/orchestratorActions.cjs');

const run = (ctx, request, config = { active: true, key: f.KEY }) => runtime.run({ db: ctx.db, request, config });

async function shadowAndActive() {
  const ctx = await f.create();
  try {
    const request = f.request(ctx, 'active', f.signed(ctx, f.action()));
    const shadow = await run(ctx, request, { active: false, key: f.KEY });
    assert.equal(shadow.status, 'shadow'); assert.equal(shadow.executed, false);
    const executed = await run(ctx, request);
    assert.equal(executed.status, 'executed_unverified'); assert.equal(executed.result.allowed, true);
    assert.equal(executed.missionVerified, false);
    const binding = await require('../src/services/missionProtocols/context').load(ctx.db, ctx.executionRun.id);
    assert.equal(binding.mission.protocolProfile, 'adopted-sealed-action');
    const rows = await ctx.db.all('SELECT mode,tokens FROM mission_action_decisions');
    assert.equal(rows.length, 2); assert.ok(rows.some(row => row.mode === 'active' && row.tokens === 3));
    await assert.rejects(run(ctx, request), { code: 'MISSION_ACTION_DUPLICATE' });
  } finally { await ctx.close(); }
}

async function tamperAndUnsealed() {
  const ctx = await f.create({ sealed: false });
  try {
    const changed = f.signed(ctx, f.action()); changed.execution.args.uncertainty = 0.9;
    const shadow = await run(ctx, f.request(ctx, 'active', changed), { active: false, key: f.KEY });
    assert.equal(shadow.decision.selectedId, null);
    assert.equal(shadow.decision.alternatives[2].reason, 'authority_unverified');
    await assert.rejects(run(ctx, f.request(ctx, 'active', f.signed(ctx, f.action()))),
      { code: 'MISSION_PROTOCOL_SEALED_AUTHORITY_REQUIRED' });
    assert.equal((await ctx.db.get("SELECT COUNT(*) count FROM mission_action_decisions WHERE mode='active'")).count, 0);
  } finally { await ctx.close(); }
}

async function budgetAndActivation() {
  const ctx = await f.create();
  try {
    const request = f.request(ctx, 'active', f.signed(ctx, f.action()));
    await assert.rejects(run(ctx, request, { active: true }), { code: 'MISSION_ACTION_ATTESTATION_REQUIRED' });
    await ctx.db.run('UPDATE strategy_execution_runs SET metrics_json=? WHERE id=?',
      JSON.stringify({ tokens: 99, costUsd: 0, latencyMs: 0 }), ctx.executionRun.id);
    const blocked = await run(ctx, request);
    assert.equal(blocked.status, 'need_evidence');
    assert.equal(blocked.decision.alternatives[2].reason, 'budget_exceeded');
    assert.equal((await ctx.db.get("SELECT COUNT(*) count FROM mission_action_decisions WHERE mode='active'")).count, 0);
  } finally { await ctx.close(); }
}

async function cliDispatch() {
  const ctx = await f.create();
  const oldFlag = process.env.GENOS_MISSION_ACTION_ACTIVE;
  const oldKey = process.env.GENOS_MISSION_ACTION_ATTESTATION_KEY;
  const write = process.stdout.write; let output = '';
  process.env.GENOS_MISSION_ACTION_ACTIVE = '1'; process.env.GENOS_MISSION_ACTION_ATTESTATION_KEY = f.KEY;
  process.stdout.write = chunk => { output += String(chunk); return true; };
  try {
    assert.equal(await handleAction({ action: 'execute_mission_action', db: ctx.db,
      request: f.request(ctx, 'active', f.signed(ctx, f.action())), orchestratorId: ctx.agentId }), true);
    assert.equal(JSON.parse(output).status, 'executed_unverified');
  } finally {
    process.stdout.write = write;
    if (oldFlag === undefined) delete process.env.GENOS_MISSION_ACTION_ACTIVE;
    else process.env.GENOS_MISSION_ACTION_ACTIVE = oldFlag;
    if (oldKey === undefined) delete process.env.GENOS_MISSION_ACTION_ATTESTATION_KEY;
    else process.env.GENOS_MISSION_ACTION_ATTESTATION_KEY = oldKey;
    await ctx.close();
  }
}

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mission-action-telemetry-'));
  process.env.GENOS_DB_PATH = path.join(directory, 'telemetry.db');
  await require('../src/db').getDatabase();
  try {
    await shadowAndActive(); await tamperAndUnsealed(); await budgetAndActivation(); await cliDispatch();
    console.log('Mission action runtime: genuine sealed runs, shadow, signatures, budgets, adoption and CLI passed.');
  } finally {
    await require('./helpers/flushTelemetrySideEffects').flushTelemetrySideEffects();
    await require('../src/db').closeDatabase();
    await fs.rm(directory, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
