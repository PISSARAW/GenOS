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
    'Return exactly one JSON object. Do not include markdown or other members\' answers.'
  ].join('\n\n');
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

module.exports = { invoke, parseResponse };
