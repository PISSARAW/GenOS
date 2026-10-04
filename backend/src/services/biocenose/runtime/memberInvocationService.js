'use strict';

const modelRouter = require('../../modelRouter');
const { REASON_CODES } = require('../contracts/beliefUpdateContract');
const { ARGUMENT_RELATIONS } = require('../contracts/argumentContract');
const { validateJudgment } = require('../contracts/judgmentContract');

const REPAIRABLE_PHASES = new Set(['SEALED_JUDGMENT', 'REVIEW', 'REVISION']);

async function invoke(input) {
  if (typeof input.memberInvoker === 'function') {
    return assertValidResponse(input, normalizeResult(await input.memberInvoker(invocationRequest(input))));
  }
  const options = {
    db: input.db, agentId: input.member.memberId,
    model: input.member.model || input.member.modelUri,
    organizationId: input.member.organizationId, projectId: input.member.projectId,
    priority: 'interactive', timeoutMs: input.timeoutMs || 60000,
    maxTokens: input.maxTokens || 2500, stream: false
  };
  let first;
  try {
    first = await modelRouter.generate({ ...options, prompt: promptFor(input) });
  } catch (error) {
    if (!REPAIRABLE_PHASES.has(input.phase) || !isStructuredOutputError(error)) throw error;
    const repaired = await modelRouter.generate({
      ...options,
      prompt: repairPrompt(input, '', ['The previous response was not valid JSON. Return exactly one complete JSON object.'])
    });
    return assertValidResponse(input, parseResponse(repaired.text));
  }
  try {
    return assertValidResponse(input, parseResponse(first.text));
  } catch (error) {
    if (!REPAIRABLE_PHASES.has(input.phase) || error.code !== 'BIOCENOSE_MEMBER_RESPONSE_INVALID') throw error;
    const errors = error.validationErrors || [error.message];
    const repaired = await modelRouter.generate({
      ...options,
      prompt: repairPrompt(input, first.text, errors)
    });
    return assertValidResponse(input, parseResponse(repaired.text));
  }
}

function isStructuredOutputError(error) {
  return /invalid structured json|malformed sse json|malformed ndjson/i.test(String(error?.message || ''));
}

function assertValidResponse(input, response) {
  const errors = responseErrors(input, response);
  if (errors.length) throw Object.assign(new Error(`Biocenose ${input.phase} response violates its contract: ${errors.join('; ')}`), {
    code: 'BIOCENOSE_MEMBER_RESPONSE_INVALID', validationErrors: errors
  });
  return response;
}

function responseErrors(input, response) {
  if (input.phase === 'SEALED_JUDGMENT') {
    const judgment = response.judgment || response;
    const result = validateJudgment({
      judgmentId: 'response', communityId: input.session.communityId,
      memberId: input.member.memberId, round: input.session.round, judgment
    });
    return result.valid ? [] : result.errors;
  }
  if (input.phase === 'REVIEW') {
    if (!Array.isArray(response.arguments)) return ['arguments must be an array (use [] when there are no arguments)'];
    return response.arguments.flatMap((item, index) => {
      const errors = [];
      if (!item || typeof item !== 'object') return [`arguments[${index}] must be an object`];
      if (!ARGUMENT_RELATIONS.includes(item.relation)) errors.push(`arguments[${index}].relation must be one of ${ARGUMENT_RELATIONS.join(', ')}`);
      const argument = item.argument || item;
      if (typeof argument.statement !== 'string' || !argument.statement.trim()) errors.push(`arguments[${index}].argument.statement is required`);
      if (item.claimId !== undefined && typeof item.claimId !== 'string') errors.push(`arguments[${index}].claimId must be a string`);
      return errors;
    });
  }
  if (input.phase === 'REVISION') {
    if (!Array.isArray(response.changedClaims)) return ['changedClaims must be an array; use [] when no claims change'];
    if (!response.changedClaims.length) return [];
    const errors = [];
    if (typeof response.newPosition !== 'string' || !response.newPosition.trim()) errors.push('newPosition is required when claims change');
    if (!Array.isArray(response.reasonCodes) || !response.reasonCodes.length || !response.reasonCodes.every((code) => REASON_CODES.includes(code))) {
      errors.push(`reasonCodes must contain one or more of ${REASON_CODES.join(', ')}`);
    }
    if (!Array.isArray(response.evidenceRefs)) errors.push('evidenceRefs must be an array (use [] when there are no references)');
    if (Array.isArray(input.details?.claims)) {
      const known = new Set(input.details.claims.map((claim) => claim.claimId));
      if (!response.changedClaims.every((claimId) => typeof claimId === 'string' && known.has(claimId))) errors.push('changedClaims must contain only supplied claimId values');
    }
    return errors;
  }
  return [];
}

function repairPrompt(input, previousResponse, errors) {
  return [
    promptFor(input),
    'Your previous JSON response failed contract validation. Return one corrected JSON object only.',
    `Validation errors: ${JSON.stringify(errors)}`,
    `Previous response: ${String(previousResponse || '').slice(0, 12000)}`,
    'Preserve the substance of your answer. Do not invent facts, evidence references, claim IDs, or human/oracle decisions. If no belief change is justified, return exactly {"changedClaims":[]}. Include every required field and use only the enumerated values.'
  ].join('\n\n');
}

function invocationRequest(input) {
  return {
    member: input.member, phase: input.phase, task: input.task,
    question: input.session.question, questionType: input.session.questionType,
    constitution: input.constitution, context: input.details || {}
  };
}

function promptFor(input) {
  return [
    'You are one independent member of a Biocenose deliberation community.',
    `Role: ${input.member.role}. Phase: ${input.phase}. Task: ${input.task}.`,
    `Question type: ${input.session.questionType}. Question: ${input.session.question}`,
    `Constitution: ${JSON.stringify(input.constitution)}`,
    `Phase context: ${JSON.stringify(input.details || {})}`,
    responseContract(input.phase),
    'Return exactly one JSON object. Do not include markdown or other members\' answers.'
  ].join('\n\n');
}

function responseContract(phase) {
  const contracts = {
    SEALED_JUDGMENT: 'Required JSON shape: {"judgment":{"position":"your answer or abstention","confidence":0.0,"claims":[{"statement":"atomic claim"}],"assumptions":[],"evidenceRefs":[],"unknowns":[],"abstentions":[],"probabilities":[{"eventId":"event id","domain":"domain","probability":0.0}]}}. Include every listed array even when empty. Confidence and probabilities must be numbers from 0 to 1. Do not invent evidence references.',
    REVIEW: 'Required JSON shape: {"summary":"brief review","arguments":[{"claimId":"claim id","relation":"SUPPORT|ATTACK|REFUTE|UNDERCUT|COUNTEREXAMPLE","argument":{"statement":"reason","targetArgumentId":"optional attacked argument id"}}],"dissent":[]}. Include arguments as an array; use an empty array when there are no arguments. Include dissent only when there is a material minority position.',
    REVISION: 'If no claim changes, return exactly {"changedClaims":[]}. Otherwise return {"previousPosition":"...","newPosition":"...","changedClaims":["claim id"],"reasonCodes":["NEW_EVIDENCE"],"evidenceRefs":["reference"]}. changedClaims must contain only claimId strings shown in the supplied claims. reasonCodes must use one or more of NEW_EVIDENCE, COUNTEREXAMPLE, FORMAL_REFUTATION, BETTER_ARGUMENT, ASSUMPTION_CHANGED, SELF_CORRECTION, MAJORITY_SIGNAL, AUTHORITY_SIGNAL. Include at least one reason code and an evidenceRefs array; do not invent evidence references. Explain the prior and revised position in those two fields.',
    LOCAL_COUNCIL_JUDGMENT: 'Required JSON shape: {"outcome":"local position","position":"local position","reasons":[],"dissent":null}. Record minority dissent as a concise object when present; use null otherwise.'
  };
  return contracts[phase] || 'Return a JSON object whose fields directly satisfy the requested task.';
}

function normalizeResult(value) {
  if (typeof value === 'string') return parseResponse(value);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidResponse();
  return value;
}

function parseResponse(value) {
  const text = String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch (_) {
    throw invalidResponse();
  }
  throw invalidResponse();
}

function invalidResponse() {
  return Object.assign(new Error('Biocenose member response must be a JSON object.'), {
    code: 'BIOCENOSE_MEMBER_RESPONSE_INVALID'
  });
}

module.exports = { invoke, parseResponse, promptFor, responseContract };
