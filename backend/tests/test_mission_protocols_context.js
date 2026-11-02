'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_GVX_LEDGER_HMAC_SECRET = 'mission-protocol-fixture-only';
const assert = require('node:assert/strict');
const fixture = require('./helpers/missionProtocolFixture');
const context = require('../src/services/missionProtocols/context');
const store = require('../src/services/missionProtocols/store');

async function main() {
  const ctx = await fixture.create();
  try {
    const preparation = await context.prepare(ctx);
    assert.equal(preparation.preparing, true);
    await assert.rejects(context.build(ctx));
    const binding = await fixture.seal(ctx);
    const reloaded = await context.load(ctx.db, binding.runId);
    assert.equal(reloaded.directory, binding.directory);
    assert.equal(reloaded.actor.incarnationId, binding.runId);
    await context.assertCurrent(reloaded);
    assert.equal(await context.authorize(binding, { scope: { organizationId: 'foreign', projectId: 'project' } }), false);
    await store.record(binding, { protocol: 'context', point: 'test', result: { status: 'observed' } });
    await assert.rejects(store.record(binding, { protocol: 'context', point: 'test', result: { status: 'invented' } }));
    await require('../src/services/missionExecutionAuthority').rotate(ctx.db, {
      missionId: binding.missionId, agentId: 'parent', forceRotate: true });
    await assert.rejects(context.assertCurrent(reloaded), { code: 'MISSION_AUTHORITY_STALE' });
    await ctx.db.run("UPDATE mission_protocol_runs SET binding_json='{}' WHERE run_id=?", binding.runId);
    await assert.rejects(context.load(ctx.db, binding.runId), /integrity mismatch/);
    console.log('Mission protocol binding: sealed authority, persistent identity, tenant isolation and revocation passed.');
  } finally { await ctx.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
