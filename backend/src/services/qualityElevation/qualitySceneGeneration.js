'use strict';
const { digest, fail, freeze } = require('./qualityContract');
const { validUsage } = require('./qualityBudget');
const { sceneBudget, sceneSchema } = require('./qualitySceneBudget');
const { sceneReply } = require('./qualitySceneLines');
const COMPLETE_ERRORS = new Set(['GQEL_SCENE_INVALID', 'GQEL_SCENE_REPETITIVE', 'GQEL_REVIEW_INVALID']);
const TRUNCATED = new Set(['length', 'max_tokens', 'num_predict']);

function captureReply(generator, observation) {
  return async request => {
    try {
      const reply = await generator(request);
      observation.reply = reply;
      return reply;
    } catch (error) {
      observation.reply = error.protocolReply || null;
      throw error;
    }
  };
}
function exactCall(context, observation) {
  const calls = context.session.calls;
  if (calls.length !== observation.before + 1) return null;
  const call = calls[observation.before];
  return call.operation === observation.operation ? call : null;
}
function knownReply(context, observation) {
  const call = exactCall(context, observation), reply = observation.reply;
  if (!call || context.session.budget.usageComplete !== true || !validUsage(call.usage) || !validUsage(reply?.usage)) return false;
  return call.usage.inputTokens === reply.usage.inputTokens && call.usage.outputTokens === reply.usage.outputTokens
    && call.finishReason === reply.finishReason && call.routeAttemptId === (reply.routeAttemptId || null);
}
function retryable(context, observation, error) {
  if (!knownReply(context, observation)) return false;
  const call = exactCall(context, observation);
  if (error.code === 'GQEL_TRUNCATED_OUTPUT') {
    return call.status === 'failed' && call.error === error.code && TRUNCATED.has(call.finishReason);
  }
  return COMPLETE_ERRORS.has(error.code) && call.finishReason === 'stop';
}
function repairPrompt(prompt, failure) {
  const split = prompt.indexOf('\n');
  if (split < 0) throw fail('GQEL_PROTOCOL_PROMPT_INVALID', 'Scene prompts must separate instructions and JSON data.');
  const data = JSON.parse(prompt.slice(split + 1));
  const guidance = 'NOUVELLE TENTATIVE BORNÉE : écris cette scène entière, concise et jouable. '
    + 'Retourne seulement {"lines":[...]} : lignes du corps sans en-tête, sans saut de ligne interne, dans les limites fournies. '
    + 'Matérialise sa décision et sa conséquence par des actions observables et vise son état final prévu. '
    + 'Chaque échange doit apporter une information, un choix ou un changement ; conclus avant de répéter le même refus. '
    + 'Respecte les scènes précédentes et les obligations du plan provisoire. Aucun fragment rejeté ne vaut validation. ';
  return guidance + prompt.slice(0, split) + '\n' + JSON.stringify({ ...data, sceneAttemptRepair: failure });
}
function attemptRecord(context, observation, result) {
  const call = exactCall(context, observation);
  return { sceneId: observation.sceneId, attempt: observation.attempt, operation: observation.operation,
    iteration: context.iteration, call: call?.call || null, routeAttemptId: call?.routeAttemptId || null,
    usage: call?.usage || null, finishReason: call?.finishReason || null,
    budget: observation.budget, acceptedForDelivery: false, ...result };
}
function withReplyEvidence(record, reply) {
  if (reply?.content !== undefined) record.responseDigest = digest(reply.content);
  if (record.status === 'rejected' && reply?.content !== undefined) record.untrustedResponse = structuredClone(reply.content);
  return freeze(record);
}
async function recordAttempt(context, observation, result) {
  const record = withReplyEvidence(attemptRecord(context, observation, result), observation.reply);
  context.session.sceneAttempts ||= [];
  context.session.sceneAttempts.push(record);
  context.session.protocolAttempts ||= [];
  context.session.protocolAttempts.push({ operation: record.operation, iteration: record.iteration, attempt: record.attempt,
    status: record.status === 'complete_draft' ? 'valid' : 'invalid', code: record.code,
    responseDigest: record.responseDigest, sceneAttemptRef: context.session.sceneAttempts.length - 1 });
  context.session.events.push({ type: 'SCENE_GENERATION_ATTEMPT', sceneId: observation.sceneId,
    attempt: observation.attempt, call: record.call, code: result.code || null,
    status: result.status, responseDigest: record.responseDigest || null, acceptedForDelivery: false });
  if (context.input.onCheckpoint) await context.input.onCheckpoint(structuredClone(context.session));
  return record;
}
function boundedValidator(input, budget) {
  return raw => {
    const text = input.validate(sceneReply(raw, { scene: input.scene, budget }));
    if (Array.from(text).length > budget.maxCharacters) throw fail('GQEL_SCENE_INVALID', 'Scene exceeds its explicit character budget.');
    return text;
  };
}
function terminalSceneFailure(error, record) {
  const terminal = Object.assign(fail(error.code || 'GQEL_SCENE_FAILED', error.message), error);
  terminal.cause = error;
  terminal.repairable = false;
  terminal.sceneAttempt = { sceneId: record.sceneId, attempt: record.attempt, call: record.call,
    responseDigest: record.responseDigest || null };
  return terminal;
}
async function generateScene(context, input) {
  const budget = sceneBudget(context.contract, context.plan, input.scene), maximum = context.contract.maxProtocolRepairs ?? 0;
  let prompt = input.prompt;
  for (let attempt = 0; attempt <= maximum; attempt++) {
    const observation = { before: context.session.calls.length, operation: `write:${input.scene.id}`,
      sceneId: input.scene.id, attempt, budget, reply: null };
    const request = { operation: observation.operation, stage: 'scene', iteration: context.iteration,
      prompt, sceneAttempt: attempt, maxOutputTokens: budget.maxOutputTokens, responseSchema: sceneSchema(budget) };
    try {
      const raw = await context.invoke(captureReply(context.generator, observation), request);
      const text = boundedValidator(input, budget)(raw);
      await recordAttempt(context, observation, { status: 'complete_draft' });
      return text;
    } catch (error) {
      const mayRetry = retryable(context, observation, error) && attempt < maximum;
      const record = await recordAttempt(context, observation, { status: 'rejected', code: error.code || 'GQEL_SCENE_FAILED',
        diagnostic: error.message, repairEligible: mayRetry, defects: error.defects || [] });
      if (!mayRetry) throw terminalSceneFailure(error, record);
      prompt = repairPrompt(input.prompt, { code: error.code, attempt: attempt + 1, call: record.call,
        responseDigest: record.responseDigest || null, finishReason: record.finishReason });
    }
  }
  throw fail('GQEL_PROTOCOL_EXHAUSTED', 'Scene attempt budget exhausted.');
}

module.exports = { generateScene };
