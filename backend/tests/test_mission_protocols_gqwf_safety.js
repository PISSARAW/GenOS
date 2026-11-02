'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_GVX_LEDGER_HMAC_SECRET = 'mission-gqwf-safety-only';
process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'mission-gqwf-safety-intent-only';
const assert = require('node:assert/strict');
const fixture = require('./helpers/missionGqwfFixture');
const gate = require('../src/services/strategyPromotionGate');
const bridge = require('../src/services/missionProtocols/gqwf');
const journal = require('../src/services/promotionExecutionJournal');
const roots = require('../src/services/gqwf/roots');
const { HEAD } = require('../src/services/missionProtocols/gqwfPromotion');

async function main() {
  const x = await fixture.create({ inProcess: true });
  try {
    await assert.rejects(gate.assertProtocolPromotion(x.ctx.db, { ...x,
      promotion: { ...x.promotion, agentId: 'another-agent' } }), /ACTOR_MISMATCH/);
    await assert.rejects(gate.assertProtocolPromotion(x.ctx.db, { ...x,
      promotion: { ...x.promotion, contract: { promotion: {} } } }), /CONTRACT_CHANGED/);
    await gate.assertProtocolPromotion(x.ctx.db, x);
    const reserved = await fixture.reserve(x);
    await x.ctx.db.run("UPDATE promotion_execution_journal SET payload_json='{}' WHERE run_id=?", x.binding.runId);
    await assert.rejects(bridge.commitReserved(x.ctx.db, { runId: x.binding.runId }), /JOURNAL_INTEGRITY/);
    await x.ctx.db.run('UPDATE promotion_execution_journal SET payload_json=? WHERE run_id=?', reserved.payload_json, x.binding.runId);
    assert.equal((await journal.read(x.ctx.db, x.binding.runId)).phase, 'reserved');
    const before = await roots.getHead(x.ctx.db, { workspaceId: x.binding.workspaceId, name: HEAD });
    await x.ctx.db.run('UPDATE gqwf_heads SET generation=generation+1 WHERE workspace_id=? AND name=?', x.binding.workspaceId, HEAD);
    await assert.rejects(bridge.commitReserved(x.ctx.db, { runId: x.binding.runId }), /current base changed|head changed/);
    const after = await roots.getHead(x.ctx.db, { workspaceId: x.binding.workspaceId, name: HEAD });
    assert.equal(after.rootHash, before.rootHash); assert.equal(after.generation, before.generation + 1);
    assert.equal((await x.ctx.db.all('SELECT * FROM gqwf_head_events')).length, 0,
      'injected competing generation invalidates cached proof without publishing the candidate');
    await assert.rejects(gate.assertProtocolPromotion(x.ctx.db, x), /BASE_REEVALUATION_REQUIRED|current base changed/);
    await require('../src/services/missionExecutionAuthority').rotate(x.ctx.db, {
      missionId: x.binding.missionId, agentId: 'parent', forceRotate: true });
    await assert.rejects(bridge.commitReserved(x.ctx.db, { runId: x.binding.runId }), /MISSION_AUTHORITY_STALE/);
    console.log('Mission GQWF exact native contract, signed intent, fresh head generation and revocation guards: PASS');
  } finally { await x.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
