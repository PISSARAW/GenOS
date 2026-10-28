'use strict';

const { createLedger } = require('../localModel');

function caseContext(testCase) {
  return [`Scenario: ${testCase.observation.scenario}`,
    `Objective: ${testCase.observation.objective}`,
    `Candidates: ${JSON.stringify(testCase.observation.candidates)}`].join('\n');
}

function actionContext(input) {
  if (!input.world) return '';
  return [`Current scenario observation: ${JSON.stringify(input.world.observation)}`,
    `Latest environment response: ${JSON.stringify(input.testCase.lastObservation || null)}`,
    'Choose one JSON action: inspect_candidate with candidateId, or submit_answer with answerId.',
    'Inspect evidence before submitting, within the action budget.'].join('\n');
}

function applyAction(input) {
  const { world, testCase, response } = input;
  if (!world) return;
  if (response?.action?.type === 'inspect_candidate') {
    const observed = world.act(response.action);
    if (observed.status === 'observed') testCase.lastObservation = observed;
  } else if (response?.action?.type === 'submit_answer') world.act(response.action);
  else if (typeof response?.answerId === 'string') {
    world.act({ type: 'submit_answer', answerId: response.answerId });
  }
}

async function runAdapter(input) {
  let response = null;
  let prior = '';
  const maxTurns = input.world?.observation.actionBudget || input.options.rounds || 1;
  for (let round = 1; round <= maxTurns; round += 1) {
    const policyPrompt = input.options.prompt({ testCase: input.testCase,
      memory: input.memory.slice(-8), round, maxTurns, prior,
      observation: input.world?.observation || input.testCase.observation,
      lastObservation: input.testCase.lastObservation || null });
    const generated = await input.ledger.generateJson({ model: input.options.model,
      prompt: `${policyPrompt}\n${actionContext(input)}`,
      seed: `${input.testCase.caseId}:${input.options.id}:${round}`, maxTokens: 160 });
    response = generated.value;
    prior = JSON.stringify(response).slice(0, 1000);
    applyAction({ ...input, response });
    if (input.world?.terminal) break;
  }
  return proposalFromResult({ world: input.world, response, id: input.options.id });
}

function proposalFromResult(input) {
  const worldResult = input.world?.result();
  const answerId = worldResult?.answerId || input.response?.answerId;
  if (typeof answerId !== 'string') throw new Error(`${input.id} omitted answerId.`);
  return { answerId,
    evidenceRefs: worldResult ? worldResult.evidenceRefs
      : Array.isArray(input.response.evidenceRefs) ? input.response.evidenceRefs : [`${answerId}:response`],
    actions: worldResult?.actions || 0 };
}

function createAdapter(options) {
  const ledger = options.ledger || createLedger();
  const memory = [];
  return {
    id: options.id,
    model: options.model,
    disclosure: options.disclosure,
    solve: (testCase) => runAdapter({ options, ledger, memory, testCase, world: testCase.world }),
    recordVerified(testCase, proposal, verification) {
      if (verification.verdict === 'supported') {
        options.onVerified?.({ testCase, proposal, memory });
      }
    },
    takeUsage: () => ledger.takeSnapshot()
  };
}

module.exports = { caseContext, createAdapter };
