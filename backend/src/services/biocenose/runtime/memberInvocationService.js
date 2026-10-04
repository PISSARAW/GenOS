'use strict';

const modelRouter = require('../../modelRouter');
const { REASON_CODES } = require('../contracts/beliefUpdateContract');
const { ARGUMENT_RELATIONS } = require('../contracts/argumentContract');
const { validateJudgment } = require('../contracts/judgmentContract');

const REPAIRABLE_PHASES = new Set(['SEALED_JUDGMENT', 'REVIEW', 'REVISION']);

async function invoke(input) {
  if (typeof input.memberInvoker === 'function') return invokeInjected(input);
  return invokeModel(input);
}

async function invokeInjected(input) {
  const request = invocationRequest(input);
  let observationTask;
  const onProviderObserved = (observation) => {
    observationTask = Promise.resolve(input.onProviderObserved?.(observation));
    return observationTask;
  };
  const call = async (repair = {}) => {
    const value = await input.memberInvoker({ ...request, ...repair, onProviderObserved });
    if (observationTask) await observationTask;
    return normalizeResult(value);
  };
  let response;
  try {
    response = await call();
    return assertValidResponse(input, response);
  } catch (error) {
    if (!REPAIRABLE_PHASES.has(input.phase) || error.code !== 'BIOCENOSE_MEMBER_RESPONSE_INVALID') throw error;
    const repaired = await call({ validationErrors: error.validationErrors || [error.message], previousResponse: response });
    return assertValidResponse(input, repaired);
  }
}

async function invokeModel(input) {
  const options = {
    db: input.db, agentId: input.member.memberId,
    model: input.member.model || input.member.modelUri,
    organizationId: input.member.organizationId, projectId: input.member.projectId,
    priority: 'interactive', timeoutMs: input.timeoutMs || defaultTimeoutMs(input),
    maxTokens: input.maxTokens || 2500, stream: false,
    responseFormat: responseFormatFor(input.phase, input.constitution?.variant)
  };
  const initial = await firstModelResponse(input, options);
  if (initial.repaired) return acceptedRepairedResponse(input, initial.response, parseResponse(initial.response.text));
  try {
    return await acceptedModelResponse(input, initial.response, parseResponse(initial.response.text));
  } catch (error) {
    if (!REPAIRABLE_PHASES.has(input.phase) || error.code !== 'BIOCENOSE_MEMBER_RESPONSE_INVALID') throw error;
    const errors = error.validationErrors || [error.message];
    const repaired = await modelRouter.generate({
      ...options,
      prompt: repairPrompt(input, initial.response.text, errors)
    });
    return acceptedRepairedResponse(input, repaired, parseResponse(repaired.text));
  }
}

async function firstModelResponse(input, options) {
  try { return { response: await modelRouter.generate({ ...options, prompt: promptFor(input) }), repaired: false }; }
  catch (error) {
    if (!REPAIRABLE_PHASES.has(input.phase) || !isStructuredOutputError(error)) throw error;
    const response = await modelRouter.generate({ ...options,
      prompt: repairPrompt(input, '', ['The previous response was not valid JSON. Return exactly one complete JSON object.']) });
    return { response, repaired: true };
  }
}

async function acceptedModelResponse(input, modelResponse, parsed) {
  const response = assertValidResponse(input, parsed);
  await recordProvider(input, modelResponse);
  return response;
}

async function acceptedRepairedResponse(input, modelResponse, parsed) {
  try { return await acceptedModelResponse(input, modelResponse, parsed); }
  catch (error) {
    if (input.phase !== 'REVISION' || !onlyUnknownClaimIds(error)) throw error;
    await recordProvider(input, modelResponse);
    const known = knownClaimIds(input);
    const rejectedClaimIds = parsed.changedClaims.filter((claimId) => !known.has(claimId));
    const position = String(input.details?.initialJudgment?.position ?? parsed.previousPosition ?? '');
    return { previousPosition: position, newPosition: position, changedClaims: [],
      reasonCodes: [], evidenceRefs: [], rejectedClaimIds };
  }
}

function onlyUnknownClaimIds(error) {
  const errors = error.validationErrors || [];
  return errors.length === 1 && errors[0] === 'changedClaims must contain only supplied claimId values';
}

function knownClaimIds(input) {
  return new Set((input.details?.claims || []).map((claim) => claim.claimId));
}

async function recordProvider(input, modelResponse) {
  if (typeof input.onProviderObserved === 'function') await input.onProviderObserved({
    memberId: input.member.memberId, provider: modelResponse.provider,
    model: modelResponse.servedModel || modelResponse.model || modelResponse.requestedModel || null
  });
}

function defaultTimeoutMs(input) {
  return input.constitution?.variant === 'representative_community' ? 300000 : 60000;
}

function isStructuredOutputError(error) {
  return /invalid structured json|malformed sse json|malformed ndjson/i.test(String(error?.message || ''));
}

function responseFormatFor(phase, variant) {
  const stringArray = { type: 'array', items: { type: 'string' } };
  const mixedClaim = variant === 'hybrid_oracle_community';
  const claimProperties = { statement: { type: 'string' }, ...(mixedClaim
    ? { type: { type: 'string', enum: ['FACTUAL', 'PROBABILISTIC', 'NORMATIVE', 'DESIGN', 'EXPLORATORY'] },
      verification: { type: 'object', required: ['kinds'], properties: { kinds: stringArray } } } : {}) };
  const schemas = {
    SEALED_JUDGMENT: {
      type: 'object', required: ['judgment'], properties: { judgment: {
        type: 'object', required: ['position', 'confidence', 'claims', 'assumptions', 'evidenceRefs', 'unknowns', 'abstentions', 'probabilities'], properties: {
          position: { type: ['string', 'number'] }, confidence: { type: 'number', minimum: 0, maximum: 1 },
          claims: { type: 'array', items: { type: 'object', required: mixedClaim ? ['statement', 'type'] : ['statement'],
            properties: claimProperties, additionalProperties: true } },
          assumptions: stringArray, evidenceRefs: stringArray, unknowns: stringArray, abstentions: stringArray,
          probabilities: { type: 'array', items: { type: 'object', required: ['eventId', 'domain', 'probability'], properties: {
            eventId: { type: 'string' }, domain: { type: 'string' }, probability: { type: 'number', minimum: 0, maximum: 1 }
          }, additionalProperties: true } }
        }, additionalProperties: true
      } }, additionalProperties: true
    },
    REVIEW: {
      type: 'object', required: ['summary', 'arguments'], properties: {
        summary: { type: 'string' }, arguments: { type: 'array', items: { type: 'object', required: ['relation', 'argument'], properties: {
          claimId: { type: 'string' }, relation: { type: 'string', enum: ARGUMENT_RELATIONS },
          argument: { type: 'object', required: ['statement'], properties: { statement: { type: 'string' }, targetArgumentId: { type: 'string' }, targetClaimId: { type: 'string' } }, additionalProperties: true }
        }, additionalProperties: true } }, dissent: { type: 'array' }
      }, additionalProperties: true
    },
    REVISION: {
      type: 'object', required: ['previousPosition', 'newPosition', 'changedClaims', 'reasonCodes', 'evidenceRefs'], properties: {
        previousPosition: { type: 'string' }, newPosition: { type: 'string' }, changedClaims: stringArray,
        reasonCodes: { type: 'array', items: { type: 'string', enum: REASON_CODES } }, evidenceRefs: stringArray
      }, additionalProperties: true
    }
  };
  return schemas[phase] ? { name: `biocenose_${phase.toLowerCase()}`, schema: schemas[phase] } : undefined;
}

function assertValidResponse(input, response) {
  const errors = responseErrors(input, response);
  if (errors.length) throw Object.assign(new Error(`Biocenose ${input.phase} response violates its contract: ${errors.join('; ')}`), {
    code: 'BIOCENOSE_MEMBER_RESPONSE_INVALID', validationErrors: errors
  });
  return response;
}

const RESPONSE_VALIDATORS = Object.freeze({
  SEALED_JUDGMENT: judgmentErrors,
  REVIEW: reviewErrors,
  REVISION: revisionErrors
});

function responseErrors(input, response) {
  return RESPONSE_VALIDATORS[input.phase]?.(input, response) || [];
}

function judgmentErrors(input, response) {
  const judgment = response.judgment || response;
  const result = validateJudgment({ judgmentId: 'response', communityId: input.session.communityId,
    memberId: input.member.memberId, round: input.session.round, judgment });
  const errors = result.valid ? [] : result.errors;
  if (input.constitution?.variant === 'hybrid_oracle_community' && input.session.questionType === 'MIXED') {
    errors.push(...hybridClaimErrors(judgment.claims));
  }
  return errors;
}

function hybridClaimErrors(claims) {
  if (!Array.isArray(claims)) return [];
  const allowed = new Set(['FACTUAL', 'PROBABILISTIC', 'NORMATIVE', 'DESIGN', 'EXPLORATORY']);
  return claims.flatMap((claim, index) => {
    if (!allowed.has(String(claim?.type || '').toUpperCase())) return [`claims[${index}].type is required`];
    if (String(claim.type).toUpperCase() !== 'FACTUAL') return [];
    const kinds = claim.verification?.kinds || claim.verificationKinds;
    return Array.isArray(kinds) && kinds.length && kinds.every((kind) => typeof kind === 'string' && kind.trim())
      ? [] : [`claims[${index}].verification.kinds must be a nonempty string array`];
  });
}

function reviewErrors(input, response) {
  if (!Array.isArray(response.arguments)) return ['arguments must be an array (use [] when there are no arguments)'];
  return response.arguments.flatMap(reviewItemErrors);
}

function reviewItemErrors(item, index) {
  if (!item || typeof item !== 'object') return [`arguments[${index}] must be an object`];
  const errors = [];
  if (!ARGUMENT_RELATIONS.includes(item.relation)) errors.push(`arguments[${index}].relation must be one of ${ARGUMENT_RELATIONS.join(', ')}`);
  const argument = item.argument || item;
  if (typeof argument.statement !== 'string' || !argument.statement.trim()) errors.push(`arguments[${index}].argument.statement is required`);
  if (item.claimId !== undefined && typeof item.claimId !== 'string') errors.push(`arguments[${index}].claimId must be a string`);
  return errors;
}

function revisionErrors(input, response) {
  if (!Array.isArray(response.changedClaims)) return ['changedClaims must be an array; use [] when no claims change'];
  if (!response.changedClaims.length) return [];
  return [...positionErrors(response), ...reasonErrors(response), ...evidenceErrors(response), ...claimReferenceErrors(input, response)];
}

function positionErrors(response) {
  return typeof response.newPosition === 'string' && response.newPosition.trim()
    ? [] : ['newPosition is required when claims change'];
}

function reasonErrors(response) {
  const valid = Array.isArray(response.reasonCodes) && response.reasonCodes.length
    && response.reasonCodes.every((code) => REASON_CODES.includes(code));
  return valid ? [] : [`reasonCodes must contain one or more of ${REASON_CODES.join(', ')}`];
}

function evidenceErrors(response) {
  return Array.isArray(response.evidenceRefs) ? [] : ['evidenceRefs must be an array (use [] when there are no references)'];
}

function claimReferenceErrors(input, response) {
  const supplied = input.details?.claims;
  if (!Array.isArray(supplied)) return [];
  const known = new Set(supplied.map((claim) => claim.claimId));
  return response.changedClaims.every((claimId) => typeof claimId === 'string' && known.has(claimId))
    ? [] : ['changedClaims must contain only supplied claimId values'];
}

function repairPrompt(input, previousResponse, errors) {
  const position = String(input.details?.initialJudgment?.position ?? '');
  const noChangeShape = input.phase === 'REVISION'
    ? JSON.stringify({ previousPosition: position, newPosition: position,
      changedClaims: [], reasonCodes: [], evidenceRefs: [] }) : '{"changedClaims":[]}';
  return [
    promptFor(input),
    'Your previous JSON response failed contract validation. Return one corrected JSON object only.',
    `Validation errors: ${JSON.stringify(errors)}`,
    `Previous response: ${String(previousResponse || '').slice(0, 12000)}`,
    'Preserve the substance of your answer. Do not invent facts, evidence references, claim IDs, or human/oracle decisions.',
    `If no belief change is justified, return ${noChangeShape}. Include every required field and use only the enumerated values.`
  ].join('\n\n');
}

function invocationRequest(input) {
  return {
    member: input.member, phase: input.phase, task: input.task,
    question: input.session.question, questionType: input.session.questionType,
    constitution: input.constitution, context: input.details || {},
    onProviderObserved: input.onProviderObserved
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
    ...(input.constitution?.variant === 'hybrid_oracle_community' ? [
      'For every claim, set type to FACTUAL, PROBABILISTIC, NORMATIVE, DESIGN, or EXPLORATORY. Every FACTUAL claim requires a nested verification object such as {"verification":{"kinds":["formal_proof"]}}; never use a dotted key. State a concrete proposition with all needed inputs, not a placeholder such as "Statement A". Classify each claim separately; do not claim that the oracle has verified it.'
    ] : []),
    'Return exactly one JSON object. Do not include markdown or other members\' answers.'
  ].join('\n\n');
}

function responseContract(phase) {
  const contracts = {
    SEALED_JUDGMENT: 'Required JSON shape: {"judgment":{"position":"your answer or abstention","confidence":0.0,"claims":[{"statement":"atomic claim"}],"assumptions":[],"evidenceRefs":[],"unknowns":[],"abstentions":[],"probabilities":[{"eventId":"event id","domain":"domain","probability":0.0}]}}. Include every listed array even when empty. Confidence and probabilities must be numbers from 0 to 1. Do not invent evidence references.',
    REVIEW: `Required JSON shape: {"summary":"brief review","arguments":[{"claimId":"claim id","relation":"${ARGUMENT_RELATIONS.join('|')}","argument":{"statement":"reason","targetArgumentId":"optional attacked argument id"}}],"dissent":[]}. Include arguments as an array; use an empty array when there are no arguments. Include dissent only when there is a material minority position.`,
    REVISION: 'Always return all five fields: previousPosition, newPosition, changedClaims, reasonCodes and evidenceRefs. If nothing changes, repeat the initial position in previousPosition and newPosition and use empty arrays for changedClaims, reasonCodes and evidenceRefs. If claims change, explain the revised position and include one or more allowed reason codes. Use only claimId values shown in the supplied claims; never invent evidence references.',
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

module.exports = { invoke, parseResponse, promptFor, responseContract, responseFormatFor, defaultTimeoutMs };
