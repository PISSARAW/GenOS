'use strict';

const registry = require('./workspaceReceiverRegistry');
const persistence = require('./agowStatePersistenceService');
const SCOPE = 'agow_query_receipts';

function handlerFor(input, module) {
  const registered = registry.queryHandlersFor({ modules: [module] })[0];
  return { handle: input.handlers?.[module] || registered?.handle,
    estimatedCost: input.handlerCosts?.[module] ?? registered?.estimatedCost ?? 1 };
}

function reservation(entry, query) {
  const cost = typeof entry.estimatedCost === 'function' ? entry.estimatedCost(query) : entry.estimatedCost;
  return Number.isFinite(cost) && cost >= 0 ? cost : Infinity;
}

async function invoke(input, entry, cost) {
  const controller = new AbortController();
  const timeLeft = input.query.budget.deadlineAt - Date.now();
  let timer;
  try {
    const timedOut = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error('query_deadline_exceeded'));
      }, Math.max(1, timeLeft));
    });
    const context = { query: structuredClone(input.query), frame: structuredClone(input.frame),
      db: input.db, signal: controller.signal, counterfactualExecutor: input.counterfactualExecutor };
    context.query.budget.maxCost = cost;
    return await Promise.race([Promise.resolve().then(() => entry.handle(context)), timedOut]);
  } finally { clearTimeout(timer); }
}

async function admit(input, response) {
  const candidate = response?.candidate;
  if (!candidate) return null;
  if (candidate.agentId !== input.frame.agentId) return { accepted: false, reason: 'candidate_agent_mismatch' };
  if (candidate.evidenceRefs?.length < input.query.minimumEvidenceRefs) {
    return { accepted: false, reason: 'evidence_requirement' };
  }
  if (Date.now() >= input.query.budget.deadlineAt) return { accepted: false, reason: 'query_deadline_exceeded' };
  return require('../globalWorkspaceService').submitCandidate({ candidate, db: input.db, triggerCycle: false });
}

async function credit(input, module, response) {
  if (!response?.outcome) return null;
  return require('./attentionCreditService').observe({ agentId: input.frame.agentId, db: input.db,
    frameId: input.query.frameId, capability: input.query.need.capability, module, outcome: response.outcome });
}

function reportedCost(response, reserved) {
  const cost = response?.outcome?.cost ?? reserved;
  if (!Number.isFinite(cost) || cost < 0 || cost > reserved) throw new Error('query_cost_exceeded');
  return cost;
}

async function executeModule(input, module, state) {
  const entry = handlerFor(input, module);
  if (typeof entry.handle !== 'function') return { module, executed: false, reason: 'handler_unavailable' };
  const cost = reservation(entry, input.query);
  if (Date.now() >= input.query.budget.deadlineAt) return { module, executed: false, reason: 'query_deadline_exceeded' };
  if (cost > state.remaining) return { module, executed: false, reason: 'query_budget_exhausted' };
  state.remaining -= cost;
  try {
    const response = await invoke(input, entry, cost);
    const actual = reportedCost(response, cost);
    state.remaining += cost - actual;
    const candidateReceipt = await admit(input, response);
    const creditReceipt = await credit(input, module, response);
    return { module, executed: true, cost: actual, response: response?.summary || null,
      candidateReceipt, creditReceipt, outcome: response?.outcome || null, realizedLoss: response?.realizedLoss };
  } catch (error) {
    return { module, executed: false, cost, reason: error.message };
  }
}

async function invalidatePathway(input, response) {
  if (!input.query.pathwayRef) return null;
  const success = response?.candidateReceipt?.accepted === true;
  const unexpected = !success || response.outcome?.success === false;
  return require('./proceduralization/decompilationService').recordOutcome({ agentId: input.frame.agentId,
    db: input.db, pathwayId: input.query.pathwayRef, contextHash: input.query.contextHash,
    success, predictionError: unexpected ? 1 : Number(response.outcome?.predictionError || 0),
    unexpectedOutcome: unexpected, evidenceRefs: [input.query.queryId], activeGoal: input.frame.activeGoal });
}

async function saveReceipt(input, result) {
  await persistence.update({ scope: SCOPE, agentId: input.frame.agentId, db: input.db }, (state) =>
    ({ receipts: [...(state.receipts || []), result].slice(-1000) }));
  if (!input.query.contextHash) return;
  await persistence.update({ scope: 'agow_query_policy', agentId: input.frame.agentId, db: input.db }, (state) => {
    const prior = state[input.query.contextHash];
    if (prior?.queryId !== input.query.queryId) return state;
    return { ...state, [input.query.contextHash]: { ...prior,
      status: result.responses.some((item) => item.executed) ? 'completed' : 'failed' } };
  });
}

function validateInput(input) {
  if (input.query.frameId !== input.frame.frameId) throw new Error('query-frame-mismatch');
  if (!Number.isFinite(input.query.budget.maxCost) || input.query.budget.maxCost < 0
    || !Number.isFinite(input.query.budget.deadlineAt)) throw new TypeError('Invalid AGOW query budget.');
}

function resultFrom(input) {
  const { query, state, responses, decompilation } = input;
  return { queryId: query.queryId, frameId: query.frameId, responses,
    cost: query.budget.maxCost - state.remaining, decompilation,
    returnedAsCandidates: responses.some((item) => item.candidateReceipt?.accepted),
    directPathHits: query.pathwayRef && responses[0]?.candidateReceipt?.accepted && !decompilation?.decompiled ? 1 : 0,
    decompilations: decompilation?.decompiled ? 1 : 0, completedAt: Date.now() };
}

async function execute(input) {
  validateInput(input);
  const state = { remaining: input.query.budget.maxCost };
  const responses = [];
  for (const module of [...new Set(input.query.candidateModules)].slice(0, 100)) {
    responses.push(await executeModule(input, module, state));
  }
  const decompilation = await invalidatePathway(input, responses[0]);
  if (decompilation?.decompiled) {
    for (const module of [...new Set(input.query.fallbackModules || [])].slice(0, 100)) {
      responses.push(await executeModule(input, module, state));
    }
  }
  const result = resultFrom({ query: input.query, state, responses, decompilation });
  await saveReceipt(input, result);
  return result;
}

module.exports = { execute, SCOPE };
