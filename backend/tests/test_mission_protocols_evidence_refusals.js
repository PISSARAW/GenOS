'use strict';

process.env.GENOS_GVX_LEDGER_HMAC_SECRET = 'mission-evidence-refusal-tests';
const assert = require('node:assert/strict');
const fixture = require('./helpers/missionProtocolFixture');
const worker = require('./helpers/biologicalWorkerFixture');
const runtime = require('../src/services/missionProtocols/runtime');

async function main() {
  const ctx = await fixture.create();
  try {
    const binding = await fixture.seal(ctx);
    await require('../src/services/missionProtocols/continuity').initialize(binding);
    let applied = false;
    const event = worker.completion(ctx.executionRun.id);
    await assert.rejects(runtime.recordEvent(ctx.db, { agentId: ctx.agentId, event,
      apply: async () => { applied = true; return { run: { status: 'completed' } }; } }),
    { code: 'MISSION_EVIDENCE_REQUIRED' });
    assert.equal(applied, false, 'a declared success cannot reach actual mission progression');
    assert.equal((await ctx.db.get('SELECT status FROM strategy_execution_runs WHERE id=?', ctx.executionRun.id)).status, 'planned');
    assert.equal(await ctx.db.get("SELECT name FROM sqlite_master WHERE name='mission_protocol_evidence'"), undefined);
    await require('../src/services/missionExecutionAuthority').rotate(ctx.db,
      { missionId: 'worker-mission', agentId: 'parent', forceRotate: true });
    await assert.rejects(runtime.recordEvent(ctx.db, { agentId: ctx.agentId, event,
      apply: async () => { applied = true; } }), /STALE/);
    assert.equal(applied, false);
    console.log('Mission EVIDENCE: missing proof and rotated authority cannot reach completion progression passed.');
  } finally { await ctx.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
