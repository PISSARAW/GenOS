'use strict';

const assert = require('node:assert/strict');
const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');
const compiler = require('../src/services/reportCompilerService');
const gate = require('../src/services/workerEvidenceTruthGate');

async function main() {
  const db = await sqlite.open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await db.exec(`CREATE TABLE telemetry_events(id TEXT, agent_id TEXT, event_type TEXT, payload_json TEXT, created_at TEXT);
      CREATE TABLE mission_agents(mission_id TEXT, agent_id TEXT);`);
    await db.run("INSERT INTO mission_agents VALUES('mission-a','root')");
    const empty = await compiler.buildTruthGraph(db, 'root', { missionId: 'mission-a' });
    assert.equal(empty.status, 'insufficient_data', 'An empty read is not measured proof');
    const cross = await compiler.buildTruthGraph(db, 'root', { missionId: 'mission-b' });
    assert.equal(cross.status, 'unavailable', 'A different mission cannot supply graph evidence');
    await db.run(`INSERT INTO telemetry_events VALUES('tool','root','ORCHESTRATION_ACTION_FAILED',?,CURRENT_TIMESTAMP)`,
      JSON.stringify({ tool: 'genos_test', result: { success: false } }));
    await db.run(`INSERT INTO telemetry_events VALUES('report','root','EVIDENCE_REPORT',?,CURRENT_TIMESTAMP)`,
      JSON.stringify({ evidenceReport: { outcome: 'success', claims: [{ statement: 'genos_test passed', evidence: ['genos_test'] }] } }));
    const graph = await compiler.buildTruthGraph(db, 'root');
    assert.equal(graph.status, 'measured');
    assert.equal(graph.nodes.find(node => node.kind === 'tool_execution').success, false);
    const report = compiler.compileReport(graph);
    assert.equal(report.claims[0].confidence, 'unverified', 'A failed execution must not support a success claim');
    await assert.rejects(gate.enforceReportGate({ agentId: 'root', autonomyPlan: { missionTruthGraph: report } }),
      { code: 'MISSION_REPORT_GATE_REJECTED' });
    const mission = await compiler.buildTruthGraph(db, 'root', { missionId: 'mission-a' });
    assert.equal(mission.status, 'insufficient_data', 'Unbound events must not leak into a mission graph');
  } finally { await db.close(); }
  console.log('Truth graph: empty, scope isolation, negative evidence and unsupported success refusal: PASS');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
