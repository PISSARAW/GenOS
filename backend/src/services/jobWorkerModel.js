const telemetry = require('./telemetryObserver');
const modelRouter = require('./modelRouter');
const { jobTimeoutMs } = require('../controllers/argumentBounds');
const { firstTruthy, codedError, parseJson, assertNotCancelled } = require('./jobWorkerSupport');

async function readPersistedModelJob(db, id) {
  if (typeof db.get !== 'function') return null;
  return db.get('SELECT * FROM model_jobs WHERE id = ?', id);
}

function modelTimeoutError(totalTimeoutMs) {
  return codedError(`Model job exceeded its total timeout of ${totalTimeoutMs}ms.`, 'MODEL_JOB_TIMEOUT');
}

async function runModelAttempt(runtime, model) {
  await assertNotCancelled(runtime.db, 'model_jobs', { id: runtime.job.id, message: 'Model job was cancelled.', code: 'MODEL_JOB_CANCELLED' });
  const modelKey = String(firstTruthy(model, runtime.config.model, 'auto'));
  if (runtime.completedModels.has(modelKey)) return;
  await runtime.db.run('DELETE FROM model_job_tokens WHERE job_id = ? AND model = ?', runtime.job.id, modelKey);
  const remainingTimeout = runtime.deadlineAt - Date.now();
  if (remainingTimeout <= 0) throw modelTimeoutError(runtime.totalTimeoutMs);
  const tokens = [];
  const started = Date.now();
  const generated = await modelRouter.generate({
    db: runtime.db,
    agentId: firstTruthy(runtime.config.agentId, runtime.job.id),
    organizationId: runtime.job.organization_id,
    projectId: runtime.job.project_id,
    model,
    prompt: runtime.job.prompt,
    timeoutMs: remainingTimeout,
    deadlineAt: runtime.deadlineAt,
    policy: runtime.config.modelRouting,
    requiredCapabilities: firstTruthy(runtime.config.requiredCapabilities, []),
    onToken: async (token, selectedModel) => {
      const tokenModel = selectedModel || modelKey;
      tokens.push(token);
      await runtime.db.run('INSERT INTO model_job_tokens(job_id, model, token_index, token) VALUES(?,?,?,?)', runtime.job.id, tokenModel, tokens.length - 1, token);
      telemetry.emitEvent({ eventType: 'MODEL_TOKEN', agentId: runtime.job.id, action: 'STREAM_TOKEN', detail: token, payload: { jobId: runtime.job.id, model: tokenModel, index: tokens.length - 1 } });
    }
  });
  if (Date.now() >= runtime.deadlineAt) throw modelTimeoutError(runtime.totalTimeoutMs);
  const output = { model: firstTruthy(generated.model, modelKey), ...generated, latencyMs: Date.now() - started, streamedTokens: tokens.length };
  runtime.outputs.push(output);
  runtime.completedModels.add(modelKey);
  if (generated.model) runtime.completedModels.add(String(generated.model));
  await runtime.db.run("UPDATE model_jobs SET result_json = ? WHERE id = ? AND status = 'running' AND claim_token = ?", JSON.stringify({ outputs: runtime.outputs, completedModels: [...runtime.completedModels] }), runtime.job.id, runtime.job.claim_token);
}

async function completeModelJob(runtime) {
  await runtime.db.run("UPDATE model_jobs SET status = 'completed', result_json = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'running' AND claim_token = ?", JSON.stringify({ outputs: runtime.outputs, completedModels: [...runtime.completedModels] }), runtime.job.id, runtime.job.claim_token);
}

async function executeModelJobBody(db, job) {
  const persisted = await readPersistedModelJob(db, job.id);
  const merged = persisted ? { ...job, ...persisted } : job;
  const models = JSON.parse(merged.models_json || '[]');
  const config = JSON.parse(merged.config_json || '{}');
  const totalTimeoutMs = jobTimeoutMs(merged.timeout_ms);
  const deadlineAt = Date.now() + totalTimeoutMs;
  const checkpoint = parseJson(merged.result_json);
  const outputs = Array.isArray(checkpoint.outputs) ? checkpoint.outputs : [];
  const completedModels = new Set(Array.isArray(checkpoint.completedModels) ? checkpoint.completedModels : outputs.map((output) => output.model));
  const runtime = { db, job: merged, config, deadlineAt, totalTimeoutMs, outputs, completedModels };
  for (const model of (models.length ? models : [null])) await runModelAttempt(runtime, model);
  await completeModelJob(runtime);
}

async function executeModelJob(db, job) {
  const heartbeatMs = Math.max(1000, Math.min(60000, Math.floor((Number(process.env.GENOS_STALE_JOB_MINUTES) || 15) * 60 * 1000 / 3)));
  const heartbeat = setInterval(() => {
    db.run("UPDATE model_jobs SET claimed_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'running' AND claim_token = ?", job.id, job.claim_token).catch(() => {});
  }, heartbeatMs);
  heartbeat.unref?.();
  try {
    return await executeModelJobBody(db, job);
  } finally {
    clearInterval(heartbeat);
  }
}

module.exports = { executeModelJob };
