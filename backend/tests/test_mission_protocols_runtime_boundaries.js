'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_GVX_LEDGER_HMAC_SECRET = 'mission-protocol-boundaries-test';
const assert = require('node:assert/strict');
const fixture = require('./helpers/missionProtocolFixture');
const runtime = require('../src/services/missionProtocols/runtime');

async function main() {
  const ctx = await fixture.create();
  try {
    const binding = await fixture.seal(ctx);
    await require('../src/services/missionProtocols/continuity').initialize(binding);
    let applied = false;
    const apply = async () => { applied = true; };
    for (const payload of [{}, { executionRunId: 'unbound-historic-run' }]) {
      await assert.rejects(runtime.recordEvent(ctx.db, { agentId: ctx.agentId,
        event: { eventType: 'AGENT_THINKING', payload }, apply }),
      { code: 'MISSION_PROTOCOL_EVENT_RUN_REQUIRED' });
    }
    await assert.rejects(runtime.recordEvent(ctx.db, { agentId: 'parent',
      event: { eventType: 'AGENT_THINKING', payload: { executionRunId: binding.runId } }, apply }),
    { code: 'MISSION_PROTOCOL_EVENT_SCOPE_MISMATCH' });
    assert.equal(applied, false, 'missing or substituted run identity never reaches business effects');
    const status = await ctx.db.get('SELECT status FROM strategy_execution_runs WHERE id=?', binding.runId);
    assert.equal(status.status, 'planned');
    console.log('Mission runtime boundaries: no downgrade through missing, historic or foreign run identity.');
  } finally { await ctx.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
