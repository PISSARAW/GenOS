'use strict';

const agent = require('./agent.cjs');
const meta = require('./metacognition.cjs');
const evidence = require('./evidence.cjs');
const { hash } = require('../competence-100/corpus.cjs');

async function inferSafely(input, session) {
  if (input.phase !== 'training') {
    const payload = agent.context(input.learned, input.task, input.phase);
    return { native: false, valid: true, value: null, payload, modelPrompt: agent.modelPrompt(payload), mode: 'verified_execution' };
  }
  try { return await agent.infer(input, session); }
  catch (error) { return { valid: false, value: null, error: error.message }; }
}

async function run(input, session) {
  let learned = await agent.store.load(session.db, agent.binding(input.arm));
  const result = await inferSafely({ ...input, learned }, session);
  const responseEvent = session.append({ type: result.native === false ? 'procedure_request' : 'model_response', ...input, result });
  if (input.phase === 'training') learned = agent.learning.consider(learned, {
    op: input.task.expression.op, proposal: result.value?.proposal || null, sourceRef: responseEvent });
  const prediction = agent.prepare(learned, input.task.expression, session.floor);
  if (!result.valid) { prediction.abstain = true; prediction.probability = 0; }
  const runId = input.phase + ':' + input.arm + ':' + input.task.id;
  const forecast = await meta.capture(session.db, { runId, agentId: input.arm, probability: prediction.probability });
  const forecastEvent = session.append({ type: 'forecast', runId, prediction, forecast });
  const response = result.valid ? agent.execute(learned, input.task.expression, prediction)
    : { answer: null, confidence: 0, abstain: true, missing: prediction.missing, source: 'invalid_model_response' };
  const executedEvent = session.append({ type: 'execution', runId, response, forecastEvent });
  const oracle = evidence.oracle({ task: input.task, response, world: session.corpus.world,
    known: Object.keys(session.corpus.world).slice(0, 4) });
  const resolution = await meta.observe(session.db, { runId, agentId: input.arm,
    correct: oracle.numericCorrect && !response.abstain, directory: session.directory });
  const oracleEvent = session.append({ type: 'oracle', runId, oracle, resolution, executedEvent });
  const row = { phase: input.phase, arm: input.arm, taskId: input.task.id, family: input.task.family,
    valid: result.valid, response, decision: { abstain: response.abstain }, oracle,
    native: result.native !== false, rawResponse: result.value, forecast, responseEvent, forecastEvent, executedEvent, oracleEvent,
    modelBudgetVerified: evidence.budgetValid(result, session.model),
    inputTokens: result.inputTokens ?? null, outputTokens: result.outputTokens ?? null };
  if (input.phase === 'training') await learn(learned, { input, row, runId }, session);
  session.rows.push(row);
  return row;
}

async function learn(learned, data, session) {
  const { input, row, runId } = data;
  const observation = meta.signObservation({ agentId: input.arm, runId, op: input.task.expression.op,
    x: input.task.expression.value, y: row.oracle.expected, forecast: row.forecast.probability,
    correct: row.oracle.numericCorrect && !row.response.abstain, directory: session.directory });
  const next = agent.learning.observe(learned, observation, meta.verifierDigest());
  const stateHash = await agent.store.save(session.db, input.arm, next);
  session.append({ type: 'learning', runId, observation, state: next, stateHash });
  session.history.push({ version: next.version, hash: stateHash,
    evidenceCount: Object.values(next.observations).flat().length,
    prediction: agent.prepare(next, session.corpus.training[0].expression).probability });
  row.stateHashAfter = hash(next);
}

module.exports = { run };
