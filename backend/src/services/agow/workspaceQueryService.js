'use strict';

const { randomUUID } = require('node:crypto');
const attention = require('../modelControlledAttentionService');
const workspace = require('../globalWorkspaceService');
const attentionCredit = require('./attentionCreditService');

const CAPABILITY_MODULES = Object.freeze({
  verification: ['verifier', 'memory', 'world_model'],
  causal_discrimination: ['world_model', 'verifier', 'memory'],
  recall: ['memory', 'autobiographical_memory'],
  perception: ['perception', 'predictive_hierarchy'],
  calibration: ['self_model', 'metacognition']
});

function buildModules(capability, modules) {
  const known = CAPABILITY_MODULES[capability] || [];
  const available = Array.isArray(modules) ? modules : known;
  return known.filter((module) => available.includes(module));
}

function plan(options) {
  const { frame } = options;
  const questionType = options.questionType || (frame.epistemicState.contradiction ? 'causal_discrimination' : 'verification');
  const capability = options.capability || (frame.epistemicState.uncertainty >= 0.5 ? 'verification' : 'recall');
  const modules = buildModules(capability, options.modules);
  const expectedInformationGain = Math.max(0, Math.min(1, Number(options.expectedInformationGain ?? frame.epistemicState.uncertainty)));
  if (!modules.length) return { planned: false, reason: 'no_eligible_modules' };
  const selected = attention.reallocate({ candidates: modules.map((id) => ({ id, baseDemand: expectedInformationGain, stateKey: capability })), state: options.attentionState, budget: options.moduleBudget || 1 });
  const query = {
    queryId: randomUUID(), frameId: frame.frameId,
    need: { questionType, capability, expectedInformationGain },
    budget: { maxCost: Math.max(0, Number(options.maxCost) || 1), deadlineAt: Number(options.deadlineAt) || Date.now() + 30000 },
    candidateModules: selected.selected.map((item) => item.id), createdAt: Date.now()
  };
  return { planned: true, query, attention: selected };
}

async function execute(options) {
  const { query } = options;
  const handlers = options.handlers || {};
  const results = [];
  for (const module of query.candidateModules) {
    const handler = handlers[module];
    if (typeof handler !== 'function') continue;
    const response = await handler({ query, frame: options.frame });
    const candidateReceipt = response?.candidate ? await workspace.submitCandidate({ candidate: response.candidate }) : null;
    const creditReceipt = response?.outcome ? attentionCredit.observe({
      frameId: query.frameId, capability: query.need.capability, module,
      outcome: { ...response.outcome, cost: response.outcome.cost ?? query.budget.maxCost }
    }) : null;
    results.push({ module, response: response?.summary || null, candidateReceipt, creditReceipt });
  }
  return { queryId: query.queryId, frameId: query.frameId, responses: results, returnedAsCandidates: results.some((result) => result.candidateReceipt?.accepted) };
}

module.exports = { plan, execute, CAPABILITY_MODULES };
