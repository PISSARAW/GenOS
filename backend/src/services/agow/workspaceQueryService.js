'use strict';

const { createHash, randomUUID } = require('node:crypto');
const attention = require('../modelControlledAttentionService');
const receiverRegistry = require('./workspaceReceiverRegistry');

const CAPABILITY_MODULES = Object.freeze({
  verification: ['verifier', 'memory', 'world_model'],
  causal_discrimination: ['world_model', 'verifier', 'memory'],
  recall: ['memory', 'autobiographical_memory'],
  perception: ['perception', 'predictive_hierarchy'],
  calibration: ['self_model', 'metacognition'],
  prospective_simulation: ['counterfactual']
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
  const requestedCost = nonNegative(options.maxCost, 1);
  const policyCost = nonNegative(policy.maxCost, 1);
  return {
    maxCost: Math.min(requestedCost, policyCost),
    moduleBudget: Math.min(100, Math.max(1, Math.floor(Number(options.moduleBudget) || Number(policy.moduleBudget) || 1)))
  };
}

function nonNegative(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function evidenceFloor(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function buildModules(capability, modules) {
  const known = CAPABILITY_MODULES[capability] || [];
  const available = Array.isArray(modules) ? modules : known;
  return known.filter((module) => available.includes(module));
}

function cognitiveDemand(frame, pathway) {
  const signals = {
    uncertainty: frame.epistemicState.uncertainty,
    irreversibility: frame.riskContext?.irreversibility || 0,
    viabilityRisk: frame.causalContext.predictionError,
    evidenceGap: frame.unresolvedQuestions.length ? 1 : 0,
    goalUrgency: 0
  };
  const decision = require('./cognitiveModePolicyService').evaluate({ signals });
  const safeForDirect = directPathAllowed({ frame, pathway, signals });
  return { decision, route: safeForDirect ? pathway : null,
    reason: safeForDirect ? 'consolidated_low_risk_procedure' : pathway ? 'procedure_requires_deliberation' : 'no_known_procedure' };
}

function directPathAllowed(input) {
  const { frame, pathway, signals } = input;
  if (!pathway || require('./pathways/directPathwayRegistry').needsReview(pathway)) return false;
  return signals.uncertainty <= 0.25 && !signals.irreversibility
    && !frame.riskContext?.requiresGlobalReview && !frame.epistemicState.contradiction
    && signals.viabilityRisk < 0.5 && pathway.confidence >= 0.9;
}

async function plan(options) {
  const { frame } = options;
  require('./agowDefaultQueriesService').ensureRegistered();
  const need = queryNeed(options);
  const [attentionPolicy, metaPolicy, queryPolicy] = await loadPolicies(frame, options.db);
  const previousQuery = queryPolicy.state[need.fingerprint];
  if (previousQuery && previousQuery.status !== 'failed' && Date.now() - previousQuery.createdAt < QUERY_COOLDOWN_MS) {
    return { planned: false, reason: 'gap_recently_queried', previousQueryId: previousQuery.queryId };
  }
  const modules = eligibleModules(need.capability, options.modules);
  const expectedInformationGain = Math.max(0, Math.min(1, Number(options.expectedInformationGain ?? frame.epistemicState.uncertainty)));
  if (!modules.length) return { planned: false, reason: 'no_eligible_modules' };
  const budget = queryBudget(options, attentionPolicy.state);
  const pathway = await require('./pathways/directPathwayRouter').resolveQuery({
    agentId: frame.agentId, db: options.db, capability: need.capability,
    contextHash: need.fingerprint, targets: modules
  });
  const demand = cognitiveDemand(frame, pathway);
  const directPathway = demand.route;
  const selected = directPathway ? { selected: [{ id: directPathway.target }], directPathway }
    : attention.reallocate({ candidates: modules.map((id) => ({ id, baseDemand: expectedInformationGain, stateKey: need.capability })), state: options.attentionState, budget: budget.moduleBudget });
  const query = queryFrom({ options, need, budget, frame, selected, directPathway,
    modules, attentionPolicy, metaPolicy, demand });
  const reserved = await reserveQuery({ agentId: frame.agentId, db: queryPolicy.db, fingerprint: need.fingerprint, query });
  if (!reserved) return { planned: false, reason: 'gap_recently_queried' };
  return { planned: true, query, attention: selected };
}

function queryFrom(input) {
  const { options, need, budget, frame, selected, directPathway, modules, attentionPolicy, metaPolicy, demand } = input;
  return {
    queryId: randomUUID(), frameId: frame.frameId,
    contextHash: need.fingerprint,
    need: { questionType: need.questionType, capability: need.capability,
      expectedInformationGain: Math.max(0, Math.min(1, Number(options.expectedInformationGain ?? frame.epistemicState.uncertainty))) },
    budget: { maxCost: budget.maxCost, deadlineAt: Number(options.deadlineAt) || Date.now() + 30000 },
    minimumEvidenceRefs: Math.max(evidenceFloor(metaPolicy.state.minimumEvidenceRefs),
      evidenceFloor(attentionPolicy.state.minimumEvidenceRefs)),
    candidateModules: selected.selected.map((item) => item.id),
    fallbackModules: modules.filter((module) => module !== directPathway?.target),
    ...(directPathway ? { pathwayRef: directPathway.pathwayId } : {}),
    cognition: { route: directPathway ? 'direct' : 'deliberative', mode: demand.decision.mode,
      reason: demand.reason, policyProvenance: demand.decision.provenance }, createdAt: Date.now()
  };
}

async function reserveQuery(input) {
  let reserved = false;
  await require('./agowStatePersistenceService').update({ scope: QUERY_POLICY_SCOPE,
    agentId: input.agentId, db: input.db }, (state) => {
    const prior = state[input.fingerprint];
    reserved = !prior || prior.status === 'failed' || Date.now() - prior.createdAt >= QUERY_COOLDOWN_MS;
    if (!reserved) return state;
    const next = { ...state, [input.fingerprint]: { queryId: input.query.queryId, createdAt: input.query.createdAt } };
    return Object.fromEntries(Object.entries(next).sort((left, right) => left[1].createdAt - right[1].createdAt).slice(-1000));
  });
  return reserved;
}

async function execute(options) {
  return require('./workspaceQueryExecutionService').execute(options);
}

module.exports = { plan, execute, CAPABILITY_MODULES, cognitiveDemand };
