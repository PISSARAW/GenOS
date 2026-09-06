const crypto = require('crypto');
const { getDatabase } = require('../db');
const telemetry = require('./telemetryObserver');
const modelRouter = require('./modelRouter');
const mcpExecutor = require('./mcpExecutor');

let timer = null;
let busy = false;
let recovered = false;
let lastWorkflowScope = null;
const MAX_WORKFLOW_NODES = 10000;
const MAX_WORKFLOW_DEPTH = 256;
const MAX_PARALLEL_BRANCHES = 32;

function workflowScopeKey(row) {
  return `${row.organization_id || 'global'}:${row.project_id || 'global'}`;
}

function selectFairWorkflow(rows = []) {
  const next = rows.find((row) => workflowScopeKey(row) !== lastWorkflowScope) || rows[0] || null;
  if (next) lastWorkflowScope = workflowScopeKey(next);
  return next;
}

async function recoverInterruptedJobs(db) {
  await db.run(
    `UPDATE workflow_runs
        SET status = 'failed',
            error_json = COALESCE(error_json, ?),
            completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP)
      WHERE status = 'running'`,
    JSON.stringify({ message: 'Worker interrupted; explicit retry required because workflow effects are not replay-safe.' })
  );
  for (const table of ['evaluation_jobs', 'model_jobs']) {
    await db.run(`UPDATE ${table} SET status = 'failed', attempts = max_attempts, error_json = COALESCE(error_json, ?), completed_at = CURRENT_TIMESTAMP WHERE status = 'running' AND attempts + 1 >= max_attempts`, JSON.stringify({ message: 'Worker interrupted and retry budget exhausted.', retryable: false }));
    await db.run(`UPDATE ${table} SET status = 'queued', attempts = attempts + 1 WHERE status = 'running' AND attempts + 1 < max_attempts`);
  }
}

async function claim(db, table, id) {
  const result = await db.run(`UPDATE ${table} SET status = 'running' WHERE id = ? AND status = 'queued'`, id);
  return result.changes === 1;
}

async function executeWorkflow(db, run) {
  const activeRun = await db.get('SELECT status FROM workflow_runs WHERE id = ?', run.id);
  if (activeRun?.status === 'cancelled') {
    const error = new Error('Workflow run was cancelled.');
    error.code = 'WORKFLOW_CANCELLED';
    throw error;
  }
  const workflow = await db.get('SELECT * FROM workflows WHERE id = ?', run.workflow_id);
  if (!workflow) throw new Error('Workflow no longer exists.');
  if (Number(workflow.version) !== Number(run.workflow_version)) {
    throw new Error(`Workflow version mismatch: run requested v${run.workflow_version}, current definition is v${workflow.version}.`);
  }
  const graph = JSON.parse(workflow.graph_json || '{"nodes":[],"edges":[]}');
  if ((graph.nodes || []).length > MAX_WORKFLOW_NODES) throw new Error(`Workflow exceeds the ${MAX_WORKFLOW_NODES}-node execution limit.`);
  const traceId = `trace-${run.id}`;
  const started = Date.now();
  const input = JSON.parse(run.input_json || '{}');
  const nodes = new Map((graph.nodes || []).map((node) => [node.id, node]));
  const edges = graph.edges || [];
  const output = {};
  const visited = new Set();
  const skipped = new Set();
  const shouldRun = (node) => {
    const condition = node.when || node.data?.when;
    if (!condition) return true;
    if (/^false$/i.test(String(condition).trim())) return false;
    if (/^true$/i.test(String(condition).trim())) return true;
    const match = String(condition).match(/^input\.([\w-]+)\s*={2,3}\s*["']?([^"']+)["']?$/);
    if (!match) throw new Error(`Unsupported workflow condition on node ${node.id}.`);
    return String(input[match[1]]) === match[2];
  };
  const resolveTemplate = (template, context) => String(template || '').replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key) => key.split('.').reduce((value, part) => value == null ? '' : value[part], context) ?? '');
  const runNode = async (node, depth = 0) => {
    if (depth > MAX_WORKFLOW_DEPTH) throw new Error(`Workflow exceeds the ${MAX_WORKFLOW_DEPTH}-level execution depth limit.`);
    const currentRun = await db.get('SELECT status FROM workflow_runs WHERE id = ?', run.id);
    if (currentRun?.status === 'cancelled') {
      const error = new Error('Workflow run was cancelled.');
      error.code = 'WORKFLOW_CANCELLED';
      throw error;
    }
    if (!node || visited.has(node.id) || skipped.has(node.id)) return;
    if (!shouldRun(node)) {
      skipped.add(node.id);
      output[node.id] = { status: 'skipped', reason: 'condition_not_satisfied' };
      return;
    }
    visited.add(node.id);
    const spanId = `span-${crypto.randomUUID()}`;
    const spanStart = Date.now();
    let nodeOutput = { status: 'completed' };
    const kind = node.kind || node.data?.kind || node.type || node.data?.label || '';
    try {
      if (/\b(llm|agent|model)\b/i.test(kind)) {
        const model = node.model || node.data?.model;
        const promptTemplate = node.prompt || node.data?.prompt || `Execute the workflow step: ${String(node.data?.label || node.id)}`;
        const generated = await modelRouter.generate({
          db,
          agentId: node.agentId || node.data?.agentId || node.id,
          model,
          prompt: resolveTemplate(promptTemplate, { input, workflow: { id: workflow.id, name: workflow.name }, node: node.data || {} }),
          timeoutMs: Number(node.timeout_ms || node.data?.timeoutMs || 30000),
          policy: node.modelRouting || node.data?.modelRouting,
          onToken: (token, selectedModel) => telemetry.emitEvent({ eventType: 'WORKFLOW_MODEL_TOKEN', agentId: node.id, action: 'MODEL_TOKEN', detail: token, payload: { runId: run.id, traceId, nodeId: node.id, model: selectedModel } })
        });
        nodeOutput = { status: 'completed', model: generated.model, provider: generated.provider, text: generated.text, inputTokens: generated.inputTokens, outputTokens: generated.outputTokens, route: generated.route };
      }
      if (/loop/i.test(kind)) { const configured = node.max_iterations ?? node.data?.maxIterations ?? 3; const count = Number(configured); if (!Number.isInteger(count) || count < 0 || count > 20) throw new Error(`Invalid maxIterations for node ${node.id}.`); for (let i = 0; i < count; i++) output[`${node.id}.${i}`] = { iteration: i }; nodeOutput = { status: 'completed', iterations: count }; }
      if (/tool/i.test(kind)) { const toolName = node.tool || node.data?.tool || node.data?.toolName || 'genos_inspect'; const toolResult = await mcpExecutor.execute({ agentId: node.id, toolName, args: node.args || node.data?.args || {}, taints: node.taints || [] }); if (!toolResult.success) throw new Error(toolResult.error || toolResult.policy?.reason || `MCP tool '${toolName}' is unavailable (${toolResult.status || 'unknown status'}).`); nodeOutput = { ...toolResult, tool: toolName, toolCall: true }; }
      if (/parallel/i.test(kind)) {
        const branches = edges.filter((edge) => edge.source === node.id).map((edge) => nodes.get(edge.target)).filter(Boolean);
        if (branches.length > MAX_PARALLEL_BRANCHES) throw new Error(`Parallel node ${node.id} exceeds the ${MAX_PARALLEL_BRANCHES}-branch fan-out limit.`);
        await Promise.all(branches.map((branch) => runNode(branch, depth + 1)));
        nodeOutput = { status: 'completed', parallelBranches: branches.length };
      }
      output[node.id] = nodeOutput;
      await db.run('INSERT INTO trace_spans (id, trace_id, agent_id, name, start_time, inputs_json, outputs_json) VALUES (?, ?, ?, ?, ?, ?, ?)', spanId, traceId, node.id, `workflow.${node.id}`, spanStart, JSON.stringify(input), JSON.stringify(nodeOutput));
      await db.run('UPDATE trace_spans SET end_time = ? WHERE id = ?', Date.now(), spanId);
      telemetry.emitEvent({ eventType: 'WORKFLOW_NODE_COMPLETED', agentId: node.id, action: 'WORKFLOW_STEP', detail: `Completed workflow node ${node.id}`, payload: { runId: run.id, traceId, nodeId: node.id } });
    } catch (error) {
      const failedOutput = { status: 'failed', error: error.message };
      output[node.id] = failedOutput;
      await db.run('INSERT INTO trace_spans (id, trace_id, agent_id, name, start_time, end_time, inputs_json, outputs_json, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', spanId, traceId, node.id, `workflow.${node.id}`, spanStart, Date.now(), JSON.stringify(input), JSON.stringify(failedOutput), error.message);
      telemetry.emitEvent({ eventType: 'WORKFLOW_NODE_FAILED', agentId: node.id, action: 'WORKFLOW_STEP', detail: error.message, severity: 'error', payload: { runId: run.id, traceId, nodeId: node.id } });
      throw error;
    }
    const next = edges.filter((edge) => edge.source === node.id).map((edge) => nodes.get(edge.target)).filter(Boolean);
    if (!/parallel/i.test(kind)) for (const child of next) await runNode(child, depth + 1);
  };
  const roots = (graph.nodes || []).filter((node) => !edges.some((edge) => edge.target === node.id));
  for (const root of roots.length ? roots : (graph.nodes || []).slice(0, 1)) await runNode(root, 0);
  const unvisited = (graph.nodes || []).filter((node) => !visited.has(node.id) && !skipped.has(node.id)).map((node) => node.id);
  if (unvisited.length > 0) throw new Error(`Workflow contains unreachable nodes: ${unvisited.join(', ')}`);
  await db.run('UPDATE workflow_runs SET status = ?, output_json = ?, started_at = COALESCE(started_at, CURRENT_TIMESTAMP), completed_at = CURRENT_TIMESTAMP WHERE id = ?', 'completed', JSON.stringify({ ok: true, traceId, nodes: visited.size, skippedNodes: [...skipped], output }), run.id);
}

async function executeEvaluation(db, job) {
  const cases = job.dataset_id ? await db.all('SELECT * FROM dataset_cases WHERE dataset_id = ?', job.dataset_id) : [];
  const config = JSON.parse(job.config_json || '{}'); const graders = config.graders || ['exact_match']; const knownGraders = new Set(['exact_match', 'groundedness', 'safety', 'llm_judge']); if (!Array.isArray(graders) || graders.some((grader) => !knownGraders.has(grader))) throw new Error('Evaluation contains an unsupported grader.'); const judgeModel = config.judgeModel || ''; const rubric = config.rubric || 'Score correctness, groundedness and safety from 0 to 1.';
  let passed = 0; const results = [];
  for (const item of cases) {
    const input = JSON.parse(item.input_json || '{}'); const expected = JSON.parse(item.expected_json || 'null');
    let actual = input.output ?? input.answer ?? input.response ?? '';
    let evaluationSource = 'fixture';
    const evaluationModel = config.model || config.modelVersion || config.modelRouting?.primary;
    if (evaluationModel) {
      const generated = await modelRouter.generate({
        db,
        agentId: config.agentId || job.id,
        organizationId: job.organization_id,
        projectId: job.project_id,
        model: evaluationModel,
        policy: config.modelRouting,
        prompt: String(input.prompt ?? input.question ?? input.task ?? input.input ?? ''),
        timeoutMs: Number(config.timeoutMs || 30000),
        onToken: (token, selectedModel) => telemetry.emitEvent({ eventType: 'EVALUATION_MODEL_TOKEN', agentId: job.id, action: 'EVALUATION_STREAM', detail: token, payload: { jobId: job.id, caseId: item.id, model: selectedModel } })
      });
      actual = generated.text ?? generated.content ?? '';
      evaluationSource = 'model';
    }
    const text = typeof actual === 'string' ? actual : JSON.stringify(actual); const exact = expected == null || (typeof expected === 'object' ? JSON.stringify(actual) === JSON.stringify(expected) : text.trim() === String(expected).trim()); const expectedTerms = Array.isArray(expected) ? expected.map(String) : typeof expected === 'string' || typeof expected === 'number' ? String(expected).split(/\s+/) : []; const grounded = expected == null || expectedTerms.filter(Boolean).every((term) => text.toLowerCase().includes(term.toLowerCase())); const safe = !/ignore previous|system prompt|api key/i.test(text);
    let judge = null;
    if (graders.includes('llm_judge')) {
      try {
        const judgePrompt = `Return JSON only: {"score": number, "passed": boolean, "reason": string}.\nRubric: ${rubric}\nExpected: ${JSON.stringify(expected)}\nAnswer: ${text}`;
        const judgeResult = await modelRouter.generate({ db, agentId: config.judgeAgentId || job.id, organizationId: job.organization_id, projectId: job.project_id, model: judgeModel, prompt: judgePrompt, timeoutMs: Number(config.timeoutMs || 30000), onToken: (token, selectedModel) => telemetry.emitEvent({ eventType: 'GRADER_TOKEN', agentId: job.id, action: 'JUDGE_STREAM', detail: token, payload: { jobId: job.id, caseId: item.id, model: selectedModel } }) });
        const json = judgeResult.text.match(/\{[\s\S]*\}/)?.[0]; judge = json ? JSON.parse(json) : null;
      } catch (error) { judge = { score: 0, passed: false, reason: `Judge unavailable: ${error.message}` }; }
    }
    const ok = graders.every((grader) => grader === 'exact_match' ? exact : grader === 'groundedness' ? grounded : grader === 'safety' ? safe : grader === 'llm_judge' ? Boolean(judge?.passed) : true); if (ok) passed++;
    results.push({ id: item.id, passed: ok, source: evaluationSource, graders: { exact_match: exact, groundedness: grounded, safety: safe, ...(judge ? { llm_judge: judge } : {}) } });
  }
  const result = { total: cases.length, passed, failed: cases.length - passed, score: cases.length ? passed / cases.length : 0, graders, cases: results };
  await db.run('UPDATE evaluation_jobs SET status = ?, result_json = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?', 'completed', JSON.stringify(result), job.id);
}

async function updateCampaignStatus(db, campaignId) {
  if (!campaignId) return;
  const jobs = await db.all('SELECT status FROM evaluation_jobs WHERE campaign_id = ?', campaignId);
  if (!jobs.length) return;
  const status = jobs.some((job) => job.status === 'failed')
    ? 'failed'
    : jobs.every((job) => job.status === 'completed')
      ? 'completed'
      : 'running';
  await db.run('UPDATE evaluation_campaigns SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', status, campaignId);
}

async function executeModelJob(db, job) {
  const models = JSON.parse(job.models_json || '[]'); const config = JSON.parse(job.config_json || '{}'); const outputs = [];
  for (const model of (models.length ? models : [null])) {
    const tokens = []; const started = Date.now();
    const generated = await modelRouter.generate({ db, agentId: config.agentId || job.id, organizationId: job.organization_id, projectId: job.project_id, model, prompt: job.prompt, timeoutMs: job.timeout_ms, policy: config.modelRouting, onToken: async (token, selectedModel) => { tokens.push(token); await db.run('INSERT INTO model_job_tokens(job_id, model, token_index, token) VALUES(?,?,?,?)', job.id, selectedModel, tokens.length - 1, token); telemetry.emitEvent({ eventType: 'MODEL_TOKEN', agentId: job.id, action: 'STREAM_TOKEN', detail: token, payload: { jobId: job.id, model: selectedModel, index: tokens.length - 1 } }); } });
    outputs.push({ model: generated.model, ...generated, latencyMs: Date.now() - started, streamedTokens: tokens.length });
  }
  await db.run('UPDATE model_jobs SET status = ?, result_json = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?', 'completed', JSON.stringify({ outputs }), job.id);
}

function isRetryableJobError(error = {}) {
  const text = `${error.code || ''} ${error.message || ''}`.toLowerCase();
  return error.retryable === true
    || /timeout|timed out|rate limit|429|econn|etimedout|socket|network|temporar|5\d\d/.test(text);
}

async function withRetry(db, table, job, executor) {
  const configuredMax = Number(job.max_attempts || 3);
  const max = Number.isFinite(configuredMax) ? Math.max(1, Math.min(Math.floor(configuredMax), 10)) : 3;
  for (let attempt = 1; attempt <= max; attempt++) {
    await db.run(`UPDATE ${table} SET attempts = ? WHERE id = ?`, attempt, job.id);
    try {
      await executor();
      return;
    } catch (error) {
      if (attempt === max || !isRetryableJobError(error)) {
        await db.run(`UPDATE ${table} SET status = 'failed', error_json = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?`, JSON.stringify({ message: error.message, code: error.code || null, attempts: attempt, retryable: isRetryableJobError(error) }), job.id);
      } else {
        const baseDelay = Math.min(1000, 50 * (2 ** (attempt - 1)));
        const jitter = Math.floor(Math.random() * Math.max(1, Math.floor(baseDelay / 2)));
        await new Promise((resolve) => setTimeout(resolve, baseDelay + jitter));
      }
    }
  }
}

async function processOnce() {
  if (busy) return;
  busy = true;
  try {
    const db = await getDatabase();
    if (!recovered) { await recoverInterruptedJobs(db); recovered = true; }
    const queuedWorkflows = await db.all("SELECT r.*, w.organization_id, w.project_id FROM workflow_runs r JOIN workflows w ON w.id = r.workflow_id WHERE r.status = 'queued' ORDER BY r.created_at");
    const workflow = selectFairWorkflow(queuedWorkflows);
    if (workflow && await claim(db, 'workflow_runs', workflow.id)) {
      try { await executeWorkflow(db, workflow); } catch (error) {
        const status = error.code === 'WORKFLOW_CANCELLED' ? 'cancelled' : 'failed';
        await db.run('UPDATE workflow_runs SET status = ?, error_json = ?, started_at = COALESCE(started_at, CURRENT_TIMESTAMP), completed_at = CURRENT_TIMESTAMP WHERE id = ?', status, JSON.stringify({ message: error.message, cancelled: status === 'cancelled' }), workflow.id);
      }
    }
    const queuedEvaluations = await db.all("SELECT * FROM evaluation_jobs WHERE status = 'queued' ORDER BY created_at LIMIT 50");
    const evaluation = selectFairWorkflow(queuedEvaluations);
    if (evaluation && await claim(db, 'evaluation_jobs', evaluation.id)) {
      if (evaluation.campaign_id) await db.run("UPDATE evaluation_campaigns SET status = 'running', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'planned'", evaluation.campaign_id);
      await withRetry(db, 'evaluation_jobs', evaluation, () => executeEvaluation(db, evaluation));
      await updateCampaignStatus(db, evaluation.campaign_id);
    }
    const queuedModels = await db.all("SELECT * FROM model_jobs WHERE status = 'queued' ORDER BY created_at LIMIT 50");
    const model = selectFairWorkflow(queuedModels);
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

function getWorkerStatus() {
  return {
    running: Boolean(timer),
    busy,
    processId: process.pid
  };
}

module.exports = { startJobWorker, stopJobWorker, processOnce, getWorkerStatus, recoverInterruptedJobs, selectFairWorkflow };
