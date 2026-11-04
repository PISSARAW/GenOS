'use strict';
const c = require('./common.cjs');
const execution = require('./execution.cjs');

function usageOf(response) {
  const input = Number.isSafeInteger(response.prompt_eval_count) ? response.prompt_eval_count : null;
  const output = Number.isSafeInteger(response.eval_count) ? response.eval_count : null;
  return { inputTokens: input, outputTokens: output,
    totalTokens: input === null || output === null ? null : input + output,
    financialTotalUsd: null, localComputeUsd: null,
    providerDurationMs: response.total_duration / 1e6,
    providerLoadMs: response.load_duration / 1e6,
    providerPromptMs: response.prompt_eval_duration / 1e6,
    providerEvalMs: response.eval_duration / 1e6 };
}

function validateManifest(manifest) {
  const { manifestHash, ...body } = manifest;
  c.assert.equal(c.hash(JSON.stringify(body)), manifestHash);
  c.assert.deepEqual(c.sources(), manifest.scripts, 'Experiment scripts changed after preregistration');
  c.assert.equal(manifest.promotionAllowed, false);
  for (const genome of Object.values(manifest.genomes)) c.assert.equal(c.fileHash(genome.file), genome.sha256);
}

function budgetValid(result) {
  const usage = result.usage;
  return Boolean(usage && usage.totalTokens !== null
    && usage.totalTokens <= c.CONFIG.totalTokens && usage.outputTokens <= c.CONFIG.outputTokens
    && result.endToEndMs <= c.CONFIG.deadlineMs);
}

function finalizeRun(result, task) {
  const usage = result.usage;
  result.budgetValid = budgetValid(result);
  result.quality = { passed: result.oracle?.score?.passed || 0, total: task.tests.length,
    allPassed: Boolean(result.admitted && result.executorPassed && result.budgetValid && result.oracle?.score?.allPassed) };
  c.write(c.path.join(result.directory, 'result.json'), result);
  console.log(JSON.stringify({ runId: result.runId,
    quality: result.quality, tokens: usage?.totalTokens ?? null,
    latencyMs: Math.round(result.endToEndMs), failure: result.failure?.message || null }));
  return result;
}

async function executeRun(manifest, run) {
  const started = performance.now();
  const directory = c.inside(manifest.archive, 'runs/' + run.runId);
  c.fs.mkdirSync(directory, { recursive: true });
  const task = manifest.cases.find(item => item.id === run.caseId);
  const genome = c.service('agentDna').decodeFile(manifest.genomes[run.arm].file);
  const workspace = execution.prepareWorkspace(directory, task);
  const body = execution.requestBody(genome, task, run);
  c.write(c.path.join(directory, 'request.json'), body);
  const result = { ...run, directory, startedAt: new Date().toISOString(),
    budget: manifest.budget, genomeHash: genome.contentHash,
    requestHash: c.hash(JSON.stringify(body)), promptHash: c.hash(JSON.stringify(body.messages)),
    initialWorkspaceSha256: c.fileHash(c.path.join(workspace, 'module.js')),
    promotionAllowed: false, admitted: false, executorPassed: false, oracle: null, usage: null };
  try {
    const response = await c.api('/api/chat', body, c.CONFIG.generationDeadlineMs);
    result.generationMs = response.wallMs;
    c.write(c.path.join(directory, 'response.json'), response.data);
    c.assert.equal(response.data.model, c.CONFIG.model, 'Unexpected provider model');
    c.assert.equal(response.data.done, true);
    result.usage = usageOf(response.data);
    const effect = await execution.applyCandidate({ directory, workspace, response: response.data, task });
    Object.assign(result, effect);
  } catch (error) { result.failure = { name: error.name, code: error.code || null, message: error.message }; }
  result.endToEndMs = performance.now() - started;
  return finalizeRun(result, task);
}

async function warmup(manifest) {
  const request = { model: c.CONFIG.model, stream: false, keep_alive: '20m',
    messages: [{ role: 'user', content: 'Ready' }],
    options: { temperature: 0, num_predict: 1, num_ctx: c.CONFIG.contextTokens } };
  c.write(c.path.join(manifest.archive, 'warmup-request.json'), request);
  const response = await c.api('/api/chat', request, 120000);
  c.write(c.path.join(manifest.archive, 'warmup-response.json'), response);
}

async function main() {
  const archive = c.path.resolve(process.argv[2]);
  c.assert.ok(archive.startsWith(c.path.join(c.ROOT, 'archive') + c.path.sep));
  c.setup(archive);
  const manifest = c.read(c.path.join(archive, 'manifest.json'));
  validateManifest(manifest);
  c.assert.ok(!c.fs.existsSync(c.path.join(archive, 'warmup-request.json')), 'Campaign cannot be silently rerun');
  c.write(c.path.join(archive, 'model-before.json'), await c.modelIdentity());
  const campaignStarted = Date.now();
  await warmup(manifest);
  const results = [];
  for (const run of manifest.runs) {
    validateManifest(manifest);
    if (Date.now() - campaignStarted + c.CONFIG.deadlineMs > manifest.campaignWallLimitMs) {
      c.write(c.path.join(archive, 'campaign-limit.json'), { completed: results.length, pending: manifest.runs.slice(results.length) });
      break;
    }
    results.push(await executeRun(manifest, run));
  }
  c.write(c.path.join(archive, 'model-after.json'), await c.modelIdentity());
  c.write(c.path.join(archive, 'results.json'), { manifestHash: manifest.manifestHash,
    promotionAllowed: false, planned: manifest.runs.length, completed: results.length, results });
  require('./report.cjs').report(archive);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
