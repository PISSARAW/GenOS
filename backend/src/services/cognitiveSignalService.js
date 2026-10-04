'use strict';

const modelRouter = require('./modelRouter');
const residualCompiler = require('./cognitiveResidualCompiler');
const receipts = require('./cognitiveInferenceReceiptService');

function answerOf(result, compiled) {
  return { agentId: compiled.contract.recipient, signalId: compiled.contract.source,
    text: String(result.text || ''), provider: result.provider || null,
    model: result.model || null, route: result.route || null,
    candidate: residualCompiler.parseCandidate(result.text), contract: compiled.contract,
    admission: compiled.admission, omissions: compiled.omissions,
    visibility: { ...compiled.visibility, model: result.model || null } };
}

function reusedAnswer(reservation) {
  if (reservation.status !== 'completed') {
    throw Object.assign(new Error(`Cognitive invocation ${reservation.status}.`),
      { code: 'COGNITIVE_SIGNAL_ALREADY_ADMITTED' });
  }
  return { ...reservation.result, candidate: residualCompiler.parseCandidate(reservation.result.text),
    reused: true };
}

async function runInference(input) {
  const { db, agentId, compiled, reservation } = input;
  try {
    const result = await modelRouter.generate({ db, agentId, prompt: compiled.prompt, priority: 'interactive' });
    const answer = answerOf(result, compiled);
    await receipts.complete(db, reservation.invocationId, answer);
    return answer;
  } catch (error) {
    await receipts.fail(db, reservation.invocationId);
    throw error;
  }
}

async function handleSignal(input) {
  const { db, agentId, signal, context } = input;
  if (!db || !agentId || signal?.llmRequired !== true) {
    throw Object.assign(new Error('A database, cognitive target, and llmRequired signal are required.'),
      { code: 'COGNITIVE_SIGNAL_INPUT_INVALID' });
  }
  const compiled = residualCompiler.compileSignal({ signal, context, agentId });
  if (compiled.status !== 'ready') {
    throw Object.assign(new Error(`Cognitive signal blocked: ${compiled.reason}`),
      { code: 'COGNITIVE_SIGNAL_BLOCKED', reason: compiled.reason });
  }
  const reservation = await receipts.reserve(db, compiled);
  if (!reservation.owned) return reusedAnswer(reservation);
  return runInference({ db, agentId, compiled, reservation });
}

module.exports = { handleSignal };
