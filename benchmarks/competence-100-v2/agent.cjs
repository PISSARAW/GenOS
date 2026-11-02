'use strict';

const { open } = require('../../backend/node_modules/sqlite');
const sqlite3 = require('../../backend/node_modules/sqlite3');
const learning = require('../../backend/src/services/experienceCompetence/learning');
const store = require('../../backend/src/services/experienceCompetence/store');
const interpreter = require('../../backend/src/services/experienceCompetence/interpreter');
const abstention = require('../../backend/src/services/abstentionService');
const oldInference = require('../competence-100/inference.cjs');
const oldAgent = require('../competence-100/agent.cjs');
const { hash } = require('../competence-100/corpus.cjs');
const meta = require('./metacognition.cjs');
const { ruleValid } = require('../../backend/src/services/experienceCompetence/contract');
const LEARNING_INSTRUCTION = [
  'Infer the integers a and b of the affine function y=a*x+b from the measurements.',
  'Return only JSON with numeric fields a and b. Check every supplied measurement.',
  'If fewer than two distinct inputs exist or the measurements contradict an affine rule, return {"a":null,"b":null}.'
].join(' ');
const INSTRUCTION = [
  'Infer the fixed integer affine rule a*x+b from verified training examples for the named operator.',
  'Use all supplied examples and learned procedures. If the rule is not identifiable, proposal must be null.',
  'Return only JSON: {"proposal":{"a":integer,"b":integer} or null,"answer":number or null,',
  '"confidence":number 0..1,"abstain":boolean,"missing":array of operator names}.',
  'Only propose a rule for targetOperator. Never invent definitions for other operators.',
  'For evaluation, use the learned procedures if provided and mark every undefined operator as missing.'
].join(' ');

async function connect(filename) {
  const db = await open({ filename, driver: sqlite3.Database });
  await store.ensure(db);
  await meta.setup(db);
  return db;
}

function context(state, task, phase) {
  const op = task.expression.op;
  return { phase, targetOperator: op, expression: task.expression, stateVersion: state.version,
    verifiedTrainingExamples: (state.observations[op] || []).map(row => ({ x: row.x, y: row.y })),
    learnedProcedures: Object.fromEntries(Object.entries(state.procedures).map(([key, value]) => [key,
      { ...value.rule, support: value.support, sourceRef: value.modelSourceRef }])), calibration: state.calibration };
}

async function infer(input, state) {
  const payload = context(input.learned, input.task, input.phase);
  const remaining = 1200000 - (Date.now() - state.started);
  if (remaining <= 0 || state.calls >= 580) throw Error('Corrected campaign budget exhausted');
  state.calls++;
  const response = await fetch('http://127.0.0.1:11434/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(Math.min(30000, remaining)),
    body: JSON.stringify({ model: state.model.name, stream: false, format: 'json', keep_alive: '5m',
      options: { temperature: 0, seed: parseInt(hash(input.task.id).slice(0, 7), 16), num_predict: 192, num_ctx: 4096 },
      messages: [{ role: 'system', content: input.phase === 'training' ? LEARNING_INSTRUCTION : INSTRUCTION },
        { role: 'user', content: modelPrompt(payload) }] })
  });
  if (!response.ok) throw Error('LLM HTTP ' + response.status);
  const body = await response.json();
  const decoded = decode(body.message?.content, input.phase);
  return { payload, modelPrompt: modelPrompt(payload), raw: body.message?.content, ...decoded, model: body.model,
    inputTokens: body.prompt_eval_count, outputTokens: body.eval_count, doneReason: body.done_reason };
}

function modelPrompt(payload) {
  if (payload.phase !== 'training') return JSON.stringify(payload);
  const pairs = payload.verifiedTrainingExamples.map(row => `x=${row.x}, y=${row.y}`).join('; ');
  return `Operator ${payload.targetOperator}. Measurements: ${pairs || 'none'}.`;
}

function decode(raw, phase) {
  let rawValue = null;
  try { rawValue = JSON.parse(raw); } catch (_) { /* Retain invalid JSON. */ }
  if (phase !== 'training') return { rawValue, value: rawValue, valid: oldAgent.validResponse(rawValue) };
  const proposal = ruleValid(rawValue) ? { a: rawValue.a, b: rawValue.b } : null;
  const valid = Boolean(proposal) || (rawValue?.a === null && rawValue?.b === null);
  return { rawValue, value: { proposal }, valid };
}

function prepare(learned, expression, floor = 0.5) {
  const prediction = interpreter.forecast(learned, expression);
  const veto = abstention.evaluateAbstention({ confidence: prediction.probability,
    uncertainty: 1 - prediction.probability, integrity: Number(prediction.complete), floor });
  return { ...prediction, abstain: !prediction.complete || veto.abstain || prediction.probability < floor,
    policy: veto, probability: veto.abstain || prediction.probability < floor ? 0 : prediction.probability };
}

function execute(learned, expression, prediction) {
  if (prediction.abstain) return { answer: null, confidence: 0, abstain: true, missing: prediction.missing, source: 'evidence_gate' };
  return interpreter.execute(learned, expression);
}

const binding = agentId => ({ agentId, verifierDigest: meta.verifierDigest() });
module.exports = { connect, context, infer, prepare, execute, binding, learning, store, oldInference, abstention, modelPrompt, decode };
