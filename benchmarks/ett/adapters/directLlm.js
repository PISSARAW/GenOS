'use strict';

const { createLedger } = require('./localModel');
const { verifyInChild } = require('../evaluation/verifyInChild');

function directPrompt(input) {
  return ['Choose the best candidate using the public evidence revealed so far.',
    `Scenario observation: ${JSON.stringify(input.testCase.observation)}`,
    `Latest environment response: ${JSON.stringify(input.latest)}`,
    `Action ${input.turn}/${input.maxTurns}. Return JSON with action {type:"inspect_candidate",candidateId:"candidate-N"} or {type:"submit_answer",answerId:"candidate-N"}.`].join('\n');
}

function applyAction(world, value) {
  if (value.action?.type === 'inspect_candidate') return world.act(value.action);
  if (value.action?.type === 'submit_answer') return world.act(value.action);
  if (typeof value.answerId === 'string') {
    return world.act({ type: 'submit_answer', answerId: value.answerId });
  }
  return null;
}

async function runActions(input) {
  let value = null;
  let latest = null;
  const maxTurns = input.testCase.observation.actionBudget;
  for (let turn = 1; turn <= maxTurns; turn += 1) {
    const generated = await input.ledger.generateJson({ model: input.model,
      prompt: directPrompt({ ...input, latest, turn, maxTurns }),
      seed: `${input.testCase.caseId}:llm_only:${turn}`, maxTokens: 128 });
    value = generated.value;
    latest = applyAction(input.testCase.world, value);
    if (input.testCase.world.terminal) break;
  }
  return { value, worldResult: input.testCase.world.result() };
}

function successOutcome(input) {
  const usage = input.ledger.summary();
  const answerId = input.worldResult?.answerId || input.value?.answerId;
  if (typeof answerId !== 'string') throw new Error('Direct model omitted answerId.');
  const evidenceRefs = input.worldResult ? input.worldResult.evidenceRefs
    : Array.isArray(input.value.evidenceRefs) ? input.value.evidenceRefs : [`${answerId}:evidence`];
  const oracle = verifyInChild(input.context.oracle, { answerId, evidenceRefs });
  return { success: true, scientificEvidence: usage.measured, condition: 'llm_only',
    actions: input.worldResult?.actions || 0,
    verifiedDiscoveries: oracle.usefulDiscoveries, normalizedCost: usage.tokens / 12000,
    measuredTokens: usage.tokens, measuredHostSeconds: usage.seconds, measuredCostUsd: 0,
    provider: input.context.model, providerCalls: usage.calls, providerCallDetails: usage.callDetails,
    submittedAnswerId: answerId, oracleVerdict: oracle.verdict, oracleDigest: oracle.oracleDigest,
    modelOutputIsEvidence: false, measurementStatus: 'ollama_provider_token_counters_and_host_time' };
}

function failureOutcome(context, ledger, error) {
  const usage = ledger.summary();
  return { success: false, scientificEvidence: false, condition: 'llm_only',
    actions: context.testCase.observation.actionBudget - context.testCase.world.remaining,
    verifiedDiscoveries: 0, normalizedCost: usage.tokens / 12000,
    measuredTokens: usage.tokens, measuredHostSeconds: usage.seconds,
    measuredCostUsd: 0, provider: context.model, providerCalls: usage.calls,
    providerCallDetails: usage.callDetails, modelOutputIsEvidence: false,
    failure: { stage: 'direct_solve', code: 'ETT_DIRECT_MODEL_FAILED', message: error.message } };
}

async function executeDirectModel(context) {
  const ledger = createLedger();
  try {
    const result = await runActions({ model: context.model, testCase: context.testCase, ledger });
    return successOutcome({ context, ledger, ...result });
  } catch (error) {
    return failureOutcome(context, ledger, error);
  }
}

module.exports = { executeDirectModel };
