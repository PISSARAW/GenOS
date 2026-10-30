'use strict';
const path = require('node:path');
const sqlite3 = require('node:module').createRequire(path.resolve(__dirname, '../../backend/package.json'))('sqlite3').verbose();
const dir = process.argv[2];
const db = new sqlite3.Database(path.join(dir, 'protocol.sqlite'), sqlite3.OPEN_READONLY);
const query = sql => new Promise((resolve, reject) => db.all(sql, (error, rows) => error ? reject(error) : resolve(rows)));
(async () => {
  const runs = await query('SELECT id,agent_id,status,guardrail_reason,budget_json,metrics_json FROM strategy_execution_runs ORDER BY rowid');
  const events = await query("SELECT agent_id,event_type,detail,payload_json FROM telemetry_events WHERE event_type IN ('AGENT_COMPLETED','AGENT_FAILED','AGENT_HALTED','LOCAL_WORKER_STARTED') ORDER BY id");
  const agents = await query('SELECT id,parent_agent_id,execution_mode,role,status FROM agents');
  const receipts = await query('SELECT run_id,receipt_json FROM biological_worker_receipts');
  process.stdout.write(JSON.stringify({ runs, agents, events: events.map(event => {
    const p = JSON.parse(event.payload_json || '{}');
    return { agentId: event.agent_id, type: event.event_type, detail: event.detail, run: p.executionRunId, model: p.model, usage: p.usage, report: p.evidenceReport, diagnostics: p.workerArtifactDiagnostics };
  }), receipts: receipts.map(row => ({ run: row.run_id, result: JSON.parse(row.receipt_json).result })) }));
})().catch(error => { process.stderr.write(error.message); process.exitCode = 1; }).finally(() => db.close());
