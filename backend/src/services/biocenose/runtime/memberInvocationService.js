'use strict';

const modelRouter = require('../../modelRouter');

async function invoke(input) {
  if (typeof input.memberInvoker === 'function') return normalizeResult(
    await input.memberInvoker(invocationRequest(input))
  );
  const response = await modelRouter.generate({
    db: input.db, agentId: input.member.memberId,
    model: input.member.model || input.member.modelUri,
    organizationId: input.member.organizationId, projectId: input.member.projectId,
    prompt: promptFor(input), priority: 'interactive', timeoutMs: input.timeoutMs || 60000,
    maxTokens: input.maxTokens || 2500, stream: false
  });
  return parseResponse(response.text);
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
