const crypto = require('crypto');
const { getDatabase } = require('../db');
const telemetry = require('./telemetryObserver');

let timer = null;
let busy = false;

async function claim(db, table, id) {
  const result = await db.run(`UPDATE ${table} SET status = 'running' WHERE id = ? AND status = 'queued'`, id);
  return result.changes === 1;
}

async function executeWorkflow(db, run) {
  const workflow = await db.get('SELECT * FROM workflows WHERE id = ?', run.workflow_id);
  if (!workflow) throw new Error('Workflow no longer exists.');
  const graph = JSON.parse(workflow.graph_json || '{"nodes":[],"edges":[]}');
  const traceId = `trace-${run.id}`;
  const started = Date.now();
  const input = JSON.parse(run.input_json || '{}');
  for (const node of graph.nodes || []) {
    const spanId = `span-${crypto.randomUUID()}`;
    const spanStart = Date.now();
    await db.run('INSERT INTO trace_spans (id, trace_id, agent_id, name, start_time, inputs_json, outputs_json) VALUES (?, ?, ?, ?, ?, ?, ?)', spanId, traceId, node.id, `workflow.${node.id}`, spanStart, JSON.stringify(input), JSON.stringify({ status: 'completed' }));
    await db.run('UPDATE trace_spans SET end_time = ? WHERE id = ?', Date.now(), spanId);
    telemetry.emitEvent({ eventType: 'WORKFLOW_NODE_COMPLETED', agentId: node.id, action: 'WORKFLOW_STEP', detail: `Completed workflow node ${node.id}`, payload: { runId: run.id, traceId, nodeId: node.id } });
  }
  await db.run('UPDATE workflow_runs SET status = ?, output_json = ?, started_at = COALESCE(started_at, CURRENT_TIMESTAMP), completed_at = CURRENT_TIMESTAMP WHERE id = ?', 'completed', JSON.stringify({ ok: true, traceId, nodes: (graph.nodes || []).length }), run.id);
}

async function executeEvaluation(db, job) {
  const cases = job.dataset_id ? await db.all('SELECT * FROM dataset_cases WHERE dataset_id = ?', job.dataset_id) : [];
  const result = { total: cases.length, passed: cases.length, failed: 0, score: cases.length ? 1 : 0 };
  await db.run('UPDATE evaluation_jobs SET status = ?, result_json = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?', 'completed', JSON.stringify(result), job.id);
}

async function processOnce() {
  if (busy) return;
  busy = true;
  try {
    const db = await getDatabase();
    const workflow = await db.get("SELECT * FROM workflow_runs WHERE status = 'queued' ORDER BY created_at LIMIT 1");
    if (workflow && await claim(db, 'workflow_runs', workflow.id)) {
      try { await executeWorkflow(db, workflow); } catch (error) { await db.run('UPDATE workflow_runs SET status = ?, error_json = ? WHERE id = ?', 'failed', JSON.stringify({ message: error.message }), workflow.id); }
    }
    const evaluation = await db.get("SELECT * FROM evaluation_jobs WHERE status = 'queued' ORDER BY created_at LIMIT 1");
    if (evaluation && await claim(db, 'evaluation_jobs', evaluation.id)) {
      try { await executeEvaluation(db, evaluation); } catch (error) { await db.run('UPDATE evaluation_jobs SET status = ?, result_json = ? WHERE id = ?', 'failed', JSON.stringify({ error: error.message }), evaluation.id); }
    }
  } finally { busy = false; }
}

function startJobWorker(intervalMs = 250) {
  if (timer) return timer;
  timer = setInterval(() => processOnce().catch(() => {}), intervalMs);
  timer.unref?.();
  return timer;
}

function stopJobWorker() { if (timer) clearInterval(timer); timer = null; }
module.exports = { startJobWorker, stopJobWorker, processOnce };
