'use strict';

const { createHash } = require('crypto');
const { validateSchema, validateArtifact } = require('./artifactSchemaService');
const { canonicalJson, coded } = require('./variantExecutionHelpers');

async function executePipeline(input = {}) {
  const state = { cache: input.cache instanceof Map ? input.cache : new Map(), resume: { ...(input.resumeState || {}) }, stages: [], value: input.input };
  for (const stage of input.stages || []) {
    const result = await processStage({ input, stage, state });
    if (result.failure) return result.failure;
    state.value = result.value;
    state.stages.push(result.stage);
    state.resume[stage.stageId] = { cacheKey: result.cacheKey, value: state.value };
  }
  return { status: 'SUCCEEDED', value: state.value, stages: state.stages, resumeState: state.resume };
}

async function processStage({ input, stage, state }) {
  if (!validInput(stage, state.value)) return { failure: pipelineFailure({ stage, code: 'INPUT_CONTRACT_REJECTED', state }) };
  const cacheKey = stageKey(stage, state.value);
  const cached = cachedOutput({ input, stage, state, cacheKey });
  if (cached) return { value: cached.value, stage: { stageId: stage.stageId, status: cached.status, attempts: 0 }, cacheKey };
  const result = await executeStage({ input, stage, value: state.value });
  if (result.status !== 'SUCCEEDED') return { failure: pipelineFailure({ stage, code: result.code, state, additional: [result] }) };
  cacheOutput({ input, cache: state.cache, cacheKey, value: result.value });
  return { value: result.value, stage: { stageId: stage.stageId, status: result.status, attempts: result.attempts }, cacheKey };
}

function validInput(stage, value) {
  const schemasValid = [...validateSchema(stage.inputSchema), ...validateSchema(stage.outputSchema)].length === 0;
  return schemasValid && validateArtifact(value, stage.inputSchema).length === 0;
}

function stageKey(stage, value) {
  return createHash('sha256').update(canonicalJson({ stageId: stage.stageId, inputSchema: stage.inputSchema, outputSchema: stage.outputSchema, value })).digest('hex');
}

function cachedOutput({ input, stage, state, cacheKey }) {
  if (cacheDisabled(input)) return null;
  const cached = state.cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() && validOutput(cached.value, stage)) return { ...cached, status: 'CACHED' };
  const resumed = state.resume[stage.stageId];
  return resumed?.cacheKey === cacheKey && validOutput(resumed.value, stage) ? { value: resumed.value, status: 'RESUMED' } : null;
}

function validOutput(value, stage) { return validateArtifact(value, stage.outputSchema).length === 0; }
function cacheDisabled(input) { return input.cacheEnabled === false || input.executionModel?.stageCache?.enabled === false; }

function cacheOutput({ input, cache, cacheKey, value }) {
  if (cacheDisabled(input)) return;
  const ttl = Number(input.cacheTtlMs ?? input.executionModel?.stageCache?.ttlMs) || 3600000;
  cache.set(cacheKey, { value, expiresAt: Date.now() + ttl });
}

async function executeStage({ input, stage, value }) {
  const retries = retryCount(input);
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const result = await runAttempt({ stage, value, attempt });
    if (result.status === 'SUCCEEDED' || shouldStop(result, attempt, retries)) return result;
    await pauseForRetry(input, attempt);
  }
  return { status: 'FAILED', code: 'ATEAM_STAGE_FAILED', attempts: retries + 1 };
}

async function runAttempt({ stage, value, attempt }) {
  try {
    const output = await stage.run(value, { attempt: attempt + 1 });
    if (!validOutput(output, stage)) return { status: 'FAILED', code: 'ATEAM_STAGE_OUTPUT_INVALID', retryable: false, attempts: attempt + 1 };
    return { status: 'SUCCEEDED', value: output, attempts: attempt + 1 };
  } catch (error) {
    return { status: 'FAILED', code: error.code || 'ATEAM_STAGE_FAILED', retryable: error.retryable, attempts: attempt + 1 };
  }
}

function shouldStop(result, attempt, retries) { return result.status !== 'SUCCEEDED' && (attempt === retries || result.retryable === false); }
function retryCount(input) {
  const policy = input.executionModel?.localRetry || {};
  if (policy.enabled === false) return 0;
  return Math.max(0, Math.floor(Number(input.maxRetries ?? policy.maxRetries) || 0));
}

async function pauseForRetry(input, attempt) {
  const policy = input.executionModel?.localRetry || {};
  const sleep = input.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const delay = Number(input.backoffMs ?? policy.backoffMs) || 0;
  await sleep(Math.max(0, delay) * (attempt + 1));
}

async function* executePipelineStream(input = {}) {
  for await (const item of input.source) {
    const result = await executePipeline({ ...input, input: item });
    if (result.status !== 'SUCCEEDED') throw coded(`Pipeline stream stopped at ${result.failedStage}.`, result.code || 'ATEAM_PIPELINE_FAILED');
    yield result.value;
  }
}

function pipelineFailure(input = {}) {
  const additional = input.additional || [];
  return { status: 'FAILED', failedStage: input.stage.stageId, code: input.code, value: input.state.value, stages: input.state.stages.concat(additional), resumeState: input.state.resume };
}

module.exports = { executePipeline, executePipelineStream };
