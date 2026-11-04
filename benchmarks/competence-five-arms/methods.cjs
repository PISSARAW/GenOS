'use strict';

const corpus = require('./corpus.cjs');
const memory = require('./memory.cjs');
const synthesis = require('../../backend/src/services/hybridProceduralLearningService');
const interpreter = require('../../backend/src/services/experienceCompetence/interpreter');
const abstention = require('../../backend/src/services/abstentionService');

function tool(history, query) {
  const rows = corpus.relevant(history, query);
  const state = { observations: {}, procedures: {} };
  for (const op of corpus.operators(query.expression)) {
    const samples = rows.filter(row => row.op === op);
    state.observations[op] = samples;
    const rule = synthesis.synthesize(samples);
    const program = synthesis.consolidate(op, rule, samples);
    if (program) state.procedures[op] = program;
  }
  const response = interpreter.execute(state, query.expression);
  const unseen = corpus.operators(query.expression).filter(op => !rows.some(row => row.op === op));
  const reason = response.abstain ? (unseen.length ? 'missing' : 'ambiguous') : 'answerable';
  return { ...response, reason, missing: [...new Set(unseen)],
    source: response.abstain ? 'affine_tool_abstention' : 'affine_tool' };
}

async function context(input, session) {
  if (input.arm === 'no_memory') return { observations: [] };
  if (input.arm === 'raw_history') return { observations: publicRows(session.history) };
  const observations = await memory.recall(session.db, { worldId: input.worldId, query: input.query });
  if (input.arm === 'hybrid') return { observations: publicRows(observations), affineTool: tool(observations, input.query) };
  return { observations: publicRows(observations) };
}

function publicRows(observations) {
  return observations.map(({ step, op, epoch, x, y }) => ({ step, op, epoch, x, y }));
}

function valid(value) {
  if (!value || typeof value !== 'object') return false;
  if (!Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) return false;
  if (typeof value.abstain !== 'boolean' || !Array.isArray(value.missing)) return false;
  if (!value.missing.every(op => typeof op === 'string')) return false;
  return validAnswer(value);
}

function validAnswer(value) {
  if (!['answerable', 'ambiguous', 'missing'].includes(value.reason)) return false;
  return value.abstain ? value.answer === null : Number.isSafeInteger(value.answer);
}

function finalize(input) {
  if (input.arm === 'synthesis_only') return { ...input.tool, valid: true };
  if (input.arm === 'hybrid' && !input.tool.abstain) return { ...input.tool, valid: true };
  if (input.arm === 'hybrid' && input.tool.missing.length) return { ...input.tool, valid: true };
  const response = input.model.value;
  if (!input.model.valid) return { answer: null, confidence: 0, abstain: true,
    missing: [], reason: 'invalid', source: 'invalid_model_response', valid: false };
  const policy = abstention.evaluateAbstention({ confidence: response.confidence,
    uncertainty: 1 - response.confidence, integrity: 1, floor: 0.5 });
  return { ...response, abstain: response.abstain || policy.abstain, valid: true,
    source: input.arm === 'hybrid' ? 'llm_fallback' : 'llm', policy };
}

module.exports = { tool, context, publicRows, valid, finalize };
