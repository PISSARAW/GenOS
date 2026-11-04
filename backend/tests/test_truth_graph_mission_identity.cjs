'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_TEST_MODE = '1';
process.env.GENOS_GVX_LEDGER_HMAC_SECRET = 'mission-identity-regression-fixture';
const assert = require('node:assert/strict');
const fixture = require('./helpers/missionProtocolFixture');
const compiler = require('../src/services/reportCompilerService');
const gate = require('../src/services/workerEvidenceTruthGate');

async function main() {
  const ctx = await fixture.create();
  try {
    await ctx.db.exec(`CREATE TABLE telemetry_events(id INTEGER PRIMARY KEY AUTOINCREMENT,agent_id TEXT,
      event_type TEXT,action TEXT,detail TEXT,payload_json TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
    ctx.autonomyPlan = { trinity: { missionId: 'comparison-worlds-alias' } };
    await ctx.db.run(`INSERT INTO telemetry_events(agent_id,event_type,action,detail,payload_json)
      VALUES(?,?,?,?,?)`, ctx.agentId, 'EVIDENCE_REPORT', 'candidate', 'Observed unresolved candidate',
      JSON.stringify({ executionRunId: ctx.executionRun.id, evidenceReport: { outcome: 'unresolved',
        claims: [{ statement: 'The proposed candidate remains unverified.', evidence: ['mission'] }] } }));
    await gate.attachTruthGraph(ctx);
    assert.equal(gate.missionId(ctx), ctx.normalizedMission.missionId);
    assert.equal(ctx.autonomyPlan.missionTruthGraph.claims.length, 1);
    const alien = await compiler.buildTruthGraph(ctx.db, ctx.agentId, { missionId: 'comparison-worlds-alias' });
    assert.equal(alien.status, 'unavailable');
    await assert.rejects(gate.attachTruthGraph({ ...ctx,
      normalizedMission: { ...ctx.normalizedMission, missionId: 'comparison-worlds-alias' } }),
    { code: 'MISSION_TRUTH_GRAPH_UNAVAILABLE' });
    console.log('Sealed mission/run provenance wins over a Trinity comparison alias; foreign aliases remain refused: PASS');
  } finally { await ctx.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
