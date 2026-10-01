'use strict';

const { createHash, randomUUID } = require('node:crypto');
const attention = require('../modelControlledAttentionService');
const workspace = require('../globalWorkspaceService');
const attentionCredit = require('./attentionCreditService');
const receiverRegistry = require('./workspaceReceiverRegistry');

const CAPABILITY_MODULES = Object.freeze({
  verification: ['verifier', 'memory', 'world_model'],
  causal_discrimination: ['world_model', 'verifier', 'memory'],
  recall: ['memory', 'autobiographical_memory'],
  perception: ['perception', 'predictive_hierarchy'],
  calibration: ['self_model', 'metacognition']
});
const QUERY_POLICY_SCOPE = 'agow_query_policy';
const QUERY_COOLDOWN_MS = 5 * 60 * 1000;

function gapFingerprint(frame, capability, questionType) {
  const input = JSON.stringify({ goal: frame.activeGoal, capability, questionType,
    questions: [...frame.unresolvedQuestions].sort(), contradiction: frame.epistemicState.contradiction > 0,
    uncertaintyBand: Math.floor(frame.epistemicState.uncertainty * 4), predictionErrorBand: Math.floor(frame.causalContext.predictionError * 4) });
  return createHash('sha256').update(input).digest('hex');
}

function queryNeed(options) {
  const frame = options.frame;
  const questionType = options.questionType || (frame.epistemicState.contradiction ? 'causal_discrimination' : 'verification');
  const capability = options.capability || (frame.epistemicState.uncertainty >= 0.5 ? 'verification' : 'recall');
  return { questionType, capability, fingerprint: gapFingerprint(frame, capability, questionType) };
}

async function loadPolicies(frame, db) {
  const persistence = require('./agowStatePersistenceService');
  return Promise.all([
    persistence.load({ scope: 'agow_attention_policy', agentId: frame.agentId, db }),
    persistence.load({ scope: 'agow_meta_policy', agentId: frame.agentId, db }),
    persistence.load({ scope: QUERY_POLICY_SCOPE, agentId: frame.agentId, db })
  ]);
}

function eligibleModules(capability, modules) {
  return receiverRegistry.queryModules({ modules: buildModules(capability, modules) });
}

function queryBudget(options, policy) {
  return {
    maxCost: Math.min(Math.max(0, Number(options.maxCost) || 1), Number(policy.maxCost) || 1),
    moduleBudget: Math.max(1, Math.floor(Number(options.moduleBudget) || Number(policy.moduleBudget) || 1))
  };
}

function buildModules(capability, modules) {
  const known = CAPABILITY_MODULES[capability] || [];
  const available = Array.isArray(modules) ? modules : known;
  return known.filter((module) => available.includes(module));
}

async function plan(options) {
  const { frame } = options;
  require('./agowDefaultQueriesService').ensureRegistered();
  const need = queryNeed(options);
  const [attentionPolicy, metaPolicy, queryPolicy] = await loadPolicies(frame, options.db);
  const previousQuery = queryPolicy.state[need.fingerprint];
  if (previousQuery && Date.now() - previousQuery.createdAt < QUERY_COOLDOWN_MS) {
    return { planned: false, reason: 'gap_recently_queried', previousQueryId: previousQuery.queryId };
  }
  const modules = eligibleModules(need.capability, options.modules);
  const expectedInformationGain = Math.max(0, Math.min(1, Number(options.expectedInformationGain ?? frame.epistemicState.uncertainty)));
  if (!modules.length) return { planned: false, reason: 'no_eligible_modules' };
  const budget = queryBudget(options, attentionPolicy.state);
  const selected = attention.reallocate({ candidates: modules.map((id) => ({ id, baseDemand: expectedInformationGain, stateKey: need.capability })), state: options.attentionState, budget: budget.moduleBudget });
  const query = {
    queryId: randomUUID(), frameId: frame.frameId,
    need: { questionType: need.questionType, capability: need.capability, expectedInformationGain },
    budget: { maxCost: budget.maxCost, deadlineAt: Number(options.deadlineAt) || Date.now() + 30000 },
    minimumEvidenceRefs: Math.max(Number(metaPolicy.state.minimumEvidenceRefs) || 0, Number(policy.minimumEvidenceRefs) || 0),
    candidateModules: selected.selected.map((item) => item.id), createdAt: Date.now()
  };
  await require('./agowStatePersistenceService').save({ scope: QUERY_POLICY_SCOPE, agentId: frame.agentId, db: queryPolicy.db,
    state: { ...queryPolicy.state, [need.fingerprint]: { queryId: query.queryId, createdAt: query.createdAt } }, version: query.createdAt });
  return { planned: true, query, attention: selected };
}

async function execute(options) {
  const { query } = options;
  const handlers = options.handlers || {};
  const registered = new Map(receiverRegistry.queryHandlersFor({ modules: query.candidateModules }).map((entry) => [entry.module, entry.handle]));
  const results = [];
  for (const module of query.candidateModules) {
    const handler = handlers[module] || registered.get(module);
    if (typeof handler !== 'function') continue;
    const response = await handler({ query, frame: options.frame, db: options.db });
    const candidateReceipt = response?.candidate ? await submitResponse({ response, query, db: options.db }) : null;
    const creditReceipt = response?.outcome ? await attentionCredit.observe({
      agentId: options.frame.agentId, db: options.db, frameId: query.frameId, capability: query.need.capability, module,
      outcome: { ...response.outcome, cost: response.outcome.cost ?? query.budget.maxCost }
    }) : null;
    results.push({ module, response: response?.summary || null, candidateReceipt, creditReceipt });
  }
  return { queryId: query.queryId, frameId: query.frameId, responses: results, returnedAsCandidates: results.some((result) => result.candidateReceipt?.accepted) };
}

async function submitResponse(options) {
  const { response, query, db } = options;
  const candidate = response.candidate;
  if (candidate.evidenceRefs.length < query.minimumEvidenceRefs) return { accepted: false, reason: 'evidence_requirement' };
  return workspace.submitCandidate({ candidate, db, triggerCycle: false });
}

module.exports = { plan, execute, CAPABILITY_MODULES };
