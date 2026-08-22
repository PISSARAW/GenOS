const crypto = require('crypto');
const { getDatabase } = require('../db');
const telemetry = require('./telemetryObserver');
const modelProvider = require('./modelProvider');

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
  const config = JSON.parse(job.config_json || '{}'); const graders = config.graders || ['exact_match']; const judgeModel = config.judgeModel || 'fake://local'; const rubric = config.rubric || 'Score correctness, groundedness and safety from 0 to 1.';
  let passed = 0; const results = [];
  for (const item of cases) {
    const input = JSON.parse(item.input_json || '{}'); const expected = JSON.parse(item.expected_json || 'null'); const text = String(input.output || input.answer || input.response || ''); const exact = expected == null || text.trim() === String(expected).trim(); const grounded = expected == null || String(expected).toLowerCase().split(/\s+/).filter(Boolean).every((term) => text.toLowerCase().includes(term)); const safe = !/ignore previous|system prompt|api key/i.test(text);
    let judge = null;
    if (graders.includes('llm_judge')) {
      try {
        const judgePrompt = `Return JSON only: {"score": number, "passed": boolean, "reason": string}.\nRubric: ${rubric}\nExpected: ${JSON.stringify(expected)}\nAnswer: ${text}`;
        const judgeResult = await modelProvider.generate({ model: judgeModel, prompt: judgePrompt, timeoutMs: Number(config.timeoutMs || 30000), onToken: (token) => telemetry.emitEvent({ eventType: 'GRADER_TOKEN', agentId: job.id, action: 'JUDGE_STREAM', detail: token, payload: { jobId: job.id, caseId: item.id } }) });
        const json = judgeResult.text.match(/\{[\s\S]*\}/)?.[0]; judge = json ? JSON.parse(json) : null;
      } catch (error) { judge = { score: 0, passed: false, reason: `Judge unavailable: ${error.message}` }; }
    }
    const ok = graders.every((grader) => grader === 'exact_match' ? exact : grader === 'groundedness' ? grounded : grader === 'safety' ? safe : grader === 'llm_judge' ? Boolean(judge?.passed) : true); if (ok) passed++;
    results.push({ id: item.id, passed: ok, graders: { exact_match: exact, groundedness: grounded, safety: safe, ...(judge ? { llm_judge: judge } : {}) } });
  }
  const result = { total: cases.length, passed, failed: cases.length - passed, score: cases.length ? passed / cases.length : 0, graders, cases: results };
  await db.run('UPDATE evaluation_jobs SET status = ?, result_json = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?', 'completed', JSON.stringify(result), job.id);
}

async function executeModelJob(db, job) {
  const models = JSON.parse(job.models_json || '[]'); const outputs = [];
  for (const model of models) {
    const tokens = []; const started = Date.now();
    const generated = await modelProvider.generate({ model, prompt: job.prompt, timeoutMs: job.timeout_ms, onToken: async (token) => { tokens.push(token); await db.run('INSERT INTO model_job_tokens(job_id, model, token_index, token) VALUES(?,?,?,?)', job.id, model, tokens.length - 1, token); telemetry.emitEvent({ eventType: 'MODEL_TOKEN', agentId: job.id, action: 'STREAM_TOKEN', detail: token, payload: { jobId: job.id, model, index: tokens.length - 1 } }); } });
    outputs.push({ model, ...generated, latencyMs: Date.now() - started, streamedTokens: tokens.length });
  }
  await db.run('UPDATE model_jobs SET status = ?, result_json = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?', 'completed', JSON.stringify({ outputs }), job.id);
}

async function withRetry(db, table, job, executor) {
  const max = Math.max(1, Number(job.max_attempts || 3));
  for (let attempt = 1; attempt <= max; attempt++) {
    await db.run(`UPDATE ${table} SET attempts = ? WHERE id = ?`, attempt, job.id);
    try { await executor(); return; } catch (error) { if (attempt === max) { await db.run(`UPDATE ${table} SET status = 'failed', error_json = ? WHERE id = ?`, JSON.stringify({ message: error.message, attempts: attempt }), job.id); } }
  }
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
      await withRetry(db, 'evaluation_jobs', evaluation, () => executeEvaluation(db, evaluation));
    }
    const model = await db.get("SELECT * FROM model_jobs WHERE status = 'queued' ORDER BY created_at LIMIT 1");
    if (model && await claim(db, 'model_jobs', model.id)) await withRetry(db, 'model_jobs', model, () => executeModelJob(db, model));
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
