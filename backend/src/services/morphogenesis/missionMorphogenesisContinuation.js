'use strict';

const { compileExpression } = require('./graph/morphologyCompiler');
const expression = require('./expression/morphologyExpression');
const { bindGraphMission } = require('./morphogenesisMissionBinding');
const communicationPlanning = require('./communicationReductionPlanning');
const rosterPlanning = require('./rosterReductionPlanning');
const { proposedRecipe, recipeProfile, recipePlanMismatch } = require('./missionMorphogenesisRecipeBinding');
const nosologyEvidence = require('./morphogenesisNosologyEvidence');
const nosologyBridge = require('./morphogenesisNosologyBridge');
const { targetRosterSize, fundedRosterReduction } = require('./missionMorphogenesisRoster');
const MAX_CALIBRATION_OUTCOMES = require('./morphogenesisVerifiedOutcomeStore').MAX_OUTCOMES;

function evidenceSignals(results) {
  const values = results.map((entry) => Number(entry.evidenceScore)).filter(Number.isFinite);
  const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const spread = values.length ? Math.max(...values) - Math.min(...values) : 0;
  const failures = results.filter((entry) => entry.status !== 'completed').length;
  return { average, spread, failures, uncertainty: Math.max(0, Math.min(1, 1 - (average / 100))) };
}

function adaptationRequired(signals, mission) {
  const threshold = Number(mission.morphogenesisPolicy?.evidenceThreshold ?? 75);
  return mission.morphogenesisPolicy?.adaptive !== false
    && (signals.failures > 0 || signals.average < threshold || signals.spread > 25);
}

function problemProfile(state, signals, policy) {
  return {
    ...(state.plan.profile || {}),
    ...(policy?.diagnosis?.signals || {}),
    uncertainty: signals.uncertainty,
    hypotheses_count: signals.average < 60 ? 3 : 2,
    exploration_need: signals.uncertainty,
    needed_independence: Math.max(0.5, signals.uncertainty),
    needed_diversity: Math.max(0.5, Math.min(1, signals.spread / 50)),
    adversarial_risk: signals.failures ? 0.8 : 0.2
  };
}

function currentTopology(state) {
  return state.plan.morphogenesisPlan?.selectedTopology || state.plan.selectedTopology || null;
}

function plannerContext(input, signals, policy) {
  const { state, continuation, orchestratorId } = input;
  const mission = state.normalizedMission || {};
  const baseProblem = mission.prompt || mission.currentTask || '';
  const representation = policy?.diagnosis?.representation;
  const recipe = proposedRecipe(policy);
  return {
    currentState: { topology: currentTopology(state), agents: new Map(), currentMorphologyVersion:
      state.plan.morphogenesisPlan?.morphologyPatch?.graph?.version || 1 },
    problemProfile: problemProfile(state, signals, policy),
    problem: representation ? `${baseProblem}\nSelected reasoning representation: ${representation.kind}.` : baseProblem,
    problemRepresentation: representation || null,
    missionId: mission.missionId || orchestratorId,
    budget: { tokens: Number(continuation.pool || 0) },
    forceMorphologySelection: !recipe,
    topologyProfile: recipe ? recipeProfile(recipe) : undefined,
    missionAssignments: []
  };
}

function rankedAlternative(plan, primary) {
  const rankings = plan.controlReceipt?.topology?.rankings || [];
  return rankings.find((entry) => entry.topology !== primary)?.topology || null;
}

function adaptiveExpression({ plan, state, signals, capacity, challenge, policy }) {
  const primary = plan.selectedTopology;
  if (proposedRecipe(policy)) return expression.topologyExpression(primary, plan.selectedVariant || null);
  if (capacity < 2) return expression.topologyExpression(primary, plan.selectedVariant || null);
  const alternative = rankedAlternative(plan, primary) || currentTopology(state);
  if (!alternative || alternative === primary) return expression.topologyExpression(primary, plan.selectedVariant || null);
  const leaves = [expression.topologyExpression(primary), expression.topologyExpression(alternative)];
  return composeAdaptiveOperator(leaves, signals, challenge);
}

function composeAdaptiveOperator(leaves, signals, challenge) {
  const competing = challenge?.status === 'challenge_authorized' || signals.failures || signals.average < 60;
  if (competing) return expression.competeExpression(leaves);
  if (signals.spread > 25) return expression.federateExpression(leaves, { quorum: 2 });
  return expression.sequenceExpression(leaves);
}

function compileAdaptiveGraph(input, outcome) {
  const { plan, state, signals, challenge, decision } = outcome;
  const capacity = targetRosterSize(input);
  const expr = adaptiveExpression({ plan, state, signals, capacity, challenge,
    policy: decision?.policy });
  const current = state.plan.morphogenesisPlan?.morphologyPatch?.graph;
  const graph = compileExpression(expr, {
    missionId: input.state.normalizedMission?.missionId || input.orchestratorId,
    mission: input.state.normalizedMission?.prompt || '',
    globalBudget: { tokens: Number(input.continuation.pool || 0), growth: 1 },
    version: Number(current?.version || 0) + 1,
    status: 'proposed'
  });
  plan.morphologyExpression = expr;
  plan.conditionalMorphogenesisPolicy = decision?.policy || null;
  plan.strategyCritique = challenge || null;
  plan.groupResourceNegotiation = decision?.resources || null;
  plan.morphologyGraphRef = { graphId: graph.graphId, version: graph.version };
  plan.morphologyPatch = { operation: 'replace_root', graph };
  return graph;
}

function topologyNodes(graph) {
  return graph.nodes.filter((node) => node.kind === 'TOPOLOGY' && node.topology);
}

async function composeComponents(input, plan, dependencies) {
  const composeMode = dependencies.composeMode || require('../biologicalTopologyService').composeMode;
  const mission = input.state.normalizedMission || {};
  const components = [];
  for (const node of topologyNodes(plan.morphologyPatch.graph)) {
    const composition = await composeMode({
      db: input.state.db,
      orchestratorId: input.orchestratorId,
      mode: node.topology,
      mission: mission.prompt || mission.currentTask || '',
      options: { activateOrganization: false, agentCount: input.rosterSize,
        missionId: mission.missionId || input.orchestratorId, variantId: node.variant || undefined }
    });
    const members = (composition.members || []).filter((member) => member.executionMode !== 'orchestrator');
    if (!members.length) throw new Error(`Topology '${node.topology}' has no continuation worker.`);
    components.push({ node, members });
  }
  return components;
}

function rebindAssignment(worker, component, index) {
  const selected = component.members[index % component.members.length];
  if (!selected) return null;
  return { ...selected, agentId: worker.agentId, workerId: worker.agentId,
    sourceAgentId: worker.agentId,
    workerKind: selected.workerKind,
    workerArtifact: selected.workerArtifact,
    capabilities: selected.capabilities || [],
    methodContract: selected.methodContract || null,
    morphologyNodeId: component.node.nodeId,
    morphologyTopology: component.node.topology, morphologyVariant: component.node.variant || null,
    morphologyComponentIndex: index };
}

function assignSurvivors(context) {
  const { input, components, challenge, primaryTopology } = context;
  if (!components.length) return null;
  if (!input.survivors.length) return {};
  if (input.survivors.length < components.length) return null;
  const assignments = {};
  for (let index = 0; index < input.survivors.length; index += 1) {
    const survivor = input.survivors[index];
    const worker = input.state.workers.get(survivor.agentId) || {};
    const assignment = rebindAssignment(worker, components[index % components.length], index);
    if (!assignment) return null;
    assignments[survivor.agentId] = assignment;
  }
  if (!assignChallengeWorker({ components, assignments, challenge, primaryTopology })) return null;
  return assignments;
}

function assignChallengeWorker(context) {
  const { components, assignments, challenge, primaryTopology } = context;
  if (challenge?.status !== 'challenge_authorized') return true;
  const alternative = components.find((component) => component.node.topology !== primaryTopology);
  const assignment = alternative && Object.values(assignments).find((item) =>
    item.morphologyNodeId === alternative.node.nodeId);
  if (!assignment) {
    challenge.status = 'challenge_alternative_unavailable';
    challenge.challenge = { ...challenge.challenge, reservedTokens: 0 };
    return false;
  }
  assignment.strategyChallenge = {
    hypothesis: challenge.alternativeHypothesis, falsifier: challenge.alternativeFalsifier,
    evidencePolicy: 'do_not_treat_worker_report_as_resolution'
  };
  return true;
}

function transitionReceipt(input, outcome) {
  const { plan, signals, assignments, decision } = outcome;
  const previous = input.state.plan.morphogenesisPlan?.morphologyPatch?.graph;
  const transitionId = `${plan.morphologyGraphRef.graphId}:${plan.morphologyGraphRef.version}`;
  return {
    transitionId,
    status: 'ADAPTED', reason: input.continuation.resourceConsolidation
      ? 'evidence_driven_resource_consolidation' : 'evidence_driven_continuation',
    fromGraph: previous ? { graphId: previous.graphId, version: previous.version } : null,
    toGraph: plan.morphologyGraphRef,
    selectedTopology: plan.selectedTopology,
    selectedVariant: plan.selectedVariant || 'default',
    candidateId: proposedRecipe(decision.policy)?.candidateId || null,
    operator: plan.morphologyExpression.kind,
    evidence: signals,
    conditionalPolicy: decision.policy,
    strategyCritique: decision.challenge,
    resourceNegotiation: decision.resources,
    resourceAllocationBinding: decision.resources?.candidate?.status === 'available'
      ? { candidateId: decision.resources.candidate.candidateId,
        planDigest: decision.resources.candidate.planDigest, transitionId } : null,
    rebinds: Object.entries(assignments).map(([workerId, assignment]) => ({
      workerId, nodeId: assignment.morphologyNodeId, topology: assignment.morphologyTopology,
      role: assignment.role, workerKind: assignment.workerKind
    }))
  };
}

function componentSlot({ components, index }) {
  const component = components[index % components.length];
  const memberIndex = Math.floor(index / components.length) % component.members.length;
  const member = component.members[memberIndex];
  return { ...member, role: member.role || member.workerKind || 'worker',
    workerKind: member.workerKind || member.role || 'worker',
    capabilities: member.capabilities || [], tools: member.tools || [],
    methodContract: member.methodContract || null,
    morphologyNodeId: component.node.nodeId, morphologyTopology: component.node.topology,
    morphologyVariant: component.node.variant || null, morphologyComponentIndex: index };
}

function lineageSource(input, index) {
  const survivors = input.survivors;
  const results = [...input.state.results.values()];
  const source = survivors.length ? survivors[index % survivors.length] : results[index % results.length];
  if (!source) return { sourceAgentId: null, sourceEvidence: null };
  return { sourceAgentId: source.agentId || null, sourceEvidence: {
    sourceAgentId: source.agentId || null, status: source.status || null,
    evidenceScore: source.evidenceScore ?? null, payload: source.payload || {}
  } };
}

function replacementRosterBlueprint(input) {
  const rosterSize = targetRosterSize(input);
  if (!rosterSize) return { rosterSize, blueprint: null };
  const assignments = Array.from({ length: rosterSize }, (_, index) => ({
    ...componentSlot({ components: input.components, index }),
    candidateId: `replacement-slot-${index + 1}`,
    ...lineageSource(input, index),
    tokenBudget: 0
  }));
  carryChallenge(input, assignments);
  return { rosterSize, blueprint: { assignments } };
}

function carryChallenge(input, assignments) {
  const challenge = input.challenge;
  if (challenge?.status !== 'challenge_authorized') return;
  const alternative = assignments.find((assignment) => assignment.morphologyTopology !== input.primaryTopology);
  if (!alternative) return;
  alternative.strategyChallenge = { hypothesis: challenge.alternativeHypothesis,
    falsifier: challenge.alternativeFalsifier,
    evidencePolicy: 'do_not_treat_worker_report_as_resolution' };
}

async function compileReplacementRoster(context) {
  const { input, plan, decision, signals, dependencies } = context;
  const rosterSize = targetRosterSize(input);
  if (!rosterSize) return { adapted: false, reason: 'cohort_budget_below_minimum',
    signals, plan, decision };
  const components = await composeComponents({ ...input, rosterSize }, plan, dependencies);
  const assignments = assignSurvivors({ input, components, challenge: decision.challenge,
    primaryTopology: plan.selectedTopology });
  if (!assignments) return { adapted: false,
    reason: decision.challenge?.status === 'challenge_alternative_unavailable'
      ? 'strategy_challenge_alternative_unavailable' : 'topology_rebind_unavailable', signals, plan, decision };
  const cohort = replacementRosterBlueprint({ components, survivors: input.survivors,
    continuation: input.continuation, state: input.state, challenge: decision.challenge,
    primaryTopology: plan.selectedTopology });
  if (!cohort.blueprint) return { adapted: false, reason: 'cohort_topology_unavailable',
    signals, plan, decision };
  const candidateAssignments = Object.fromEntries(cohort.blueprint.assignments.map((assignment) =>
    [assignment.candidateId, { ...assignment, agentId: assignment.candidateId,
      workerId: assignment.candidateId }]));
  const publishedAssignments = input.survivors.length ? assignments : candidateAssignments;
  require('./morphogenesisGenomePlanBinding').bindDispatchGenomeBindings(plan, Object.values(publishedAssignments));
  bindGraphMission(plan.morphologyPatch.graph, { assignments: Object.values(publishedAssignments) });
  const receipt = transitionReceipt(input, { plan, signals, assignments: publishedAssignments, decision });
  return { adapted: true, assignments: publishedAssignments, cohortBlueprint: cohort.blueprint,
    targetWorkerCount: cohort.rosterSize, plan, receipt, signals, decision };
}

const { admissionForTransition } = require('./morphogenesisTransitionAdmission');

function shouldSkipAdaptation(input, signals, decision) {
  const challengeRequired = decision.challenge?.status === 'challenge_authorized';
  return !adaptationRequired(signals, input.state.normalizedMission || {}) && !challengeRequired;
}

function selectorAbstained(decision) {
  return decision.policy?.decision?.interventionScale === 'NO_CHANGE'
    && decision.challenge?.status !== 'challenge_authorized';
}

async function loadVerifiedOutcomes(input, dependencies) {
  if (typeof dependencies.loadVerifiedOutcomes !== 'function') return [];
  const mission = input.state.normalizedMission || {};
  try {
    const rows = await dependencies.loadVerifiedOutcomes({
      missionId: mission.missionId || input.orchestratorId,
      limit: MAX_CALIBRATION_OUTCOMES
    });
    return Array.isArray(rows) && rows.length <= MAX_CALIBRATION_OUTCOMES ? rows : [];
  } catch (_) {
    return [];
  }
}
function nosologyScope(input) {
  const mission = input.state.normalizedMission || {};
  const workerIds = input.state.workers instanceof Map ? [...input.state.workers.keys()] : [];
  return { db: input.state.db, missionId: mission.missionId || input.orchestratorId,
    organizationId: input.state.organizationId || mission.organizationId,
    projectId: input.state.projectId || mission.projectId,
    orchestratorId: input.orchestratorId, agentIds: [input.orchestratorId, ...workerIds] };
}

async function loadNosology(input, dependencies, signals) {
  const loader = dependencies.loadNosologyEvidence || nosologyEvidence.loadNosologyEvidence;
  let evidence;
  try { evidence = await loader(nosologyScope(input)); }
  catch (error) { evidence = { status: 'unavailable', states: [], pathologies: [],
    rustApplications: [], errors: [error.code || 'nosology_bridge_failed'] }; }
  return nosologyBridge.compileNosologyBridge({ evidence, runtimeSignals: signals,
    state: input.state, orchestratorId: input.orchestratorId });
}

function earlyDecision(context) {
  const { input, signals, decision, communicationMetric, nosology } = context;
  if (nosology.gate.status === 'blocked') return { adapted: false,
    reason: 'nosology_quarantine_gate', signals, decision, nosology };
  if (shouldSkipAdaptation(input, signals, decision)) {
    return { adapted: false, reason: 'adaptation_not_required', signals, decision };
  }
  if (selectorAbstained(decision) && !fundedRosterReduction(context.input)) {
    return { adapted: false, reason: 'selector_no_change', signals, decision };
  }
  if (communicationPlanning.selected(decision)) {
    return communicationPlanning.plan(input, decision, communicationMetric);
  }
  return rosterPlanning.selected(decision)
    ? rosterPlanning.plan(decision, decision.rosterPlan) : null;
}

async function planContinuation(input, dependencies = {}) {
  const results = [...input.state.results.values()];
  const signals = evidenceSignals(results);
  const verifiedOutcomes = await loadVerifiedOutcomes(input, dependencies);
  const nosologyProjectionOutcomes = await require('./morphogenesisNosologyOutcomeStore').loadForContinuation(input, dependencies);
  const communicationMetric = await communicationPlanning.loadVerifiedMetric(input, dependencies);
  const nosology = await loadNosology(input, dependencies, signals);
  const decisionInput = { ...input, verifiedOutcomes, nosologyProjectionOutcomes,
    communicationMetric, nosology };
  const decision = require('./morphogenesisEpochDecisionService').compilePolicy(decisionInput, signals);
  const early = earlyDecision({ input, signals, decision, communicationMetric, nosology });
  if (early) return early;
  const resourceConsolidation = selectorAbstained(decision) && fundedRosterReduction(input);
  const continuationInput = resourceConsolidation ? { ...input,
    continuation: { ...input.continuation, survivorCount: input.survivors.length,
      targetWorkerCount: input.survivors.length, resourceConsolidation: true } } : input;
  const genomeService = require('./morphogenesisGenomeContext');
  const genomeContext = await genomeService.loadMissionGenomeContext({ ...nosologyScope(continuationInput), normalizedMission: continuationInput.state.normalizedMission });
  const planner = dependencies.planMorphogenesis
    || require('./morphogenesisPlannerService').planMorphogenesis;
  const plan = planner(genomeService.enrichPlanningInput(plannerContext(continuationInput, signals, decision.policy), genomeContext));
  if (recipePlanMismatch(plan, decision.policy)) return { adapted: false,
    reason: 'proposed_recipe_plan_mismatch', signals, decision };
  compileAdaptiveGraph(continuationInput, { plan, state: continuationInput.state, signals, challenge: decision.challenge, decision });
  const result = await compileReplacementRoster({ input: continuationInput, plan, decision, signals, dependencies });
  if (!result.adapted) return result;
  const admission = await (dependencies.admissionForTransition || admissionForTransition)(continuationInput, result);
  { const __genosStageResult1 = require('./missionMorphogenesisContinuationStages1.js').planContinuationStage1({ get admission() { return admission; }, set admission(__genosNextStageValue) { admission = __genosNextStageValue; }, get result() { return result; }, set result(__genosNextStageValue) { result = __genosNextStageValue; } }); if (__genosStageResult1) return __genosStageResult1.value; }
  require('./missionMorphogenesisContinuationStages1.js').planContinuationStage3({ get admission() { return admission; }, set admission(__genosNextStageValue) { admission = __genosNextStageValue; }, get result() { return result; }, set result(__genosNextStageValue) { result = __genosNextStageValue; } });
  result.admission = admission;
  require('./missionMorphogenesisContinuationStages1.js').planContinuationStage2({ get admission() { return admission; }, set admission(__genosNextStageValue) { admission = __genosNextStageValue; }, get result() { return result; }, set result(__genosNextStageValue) { result = __genosNextStageValue; } });
  input.state.plan.morphogenesisPlan = result.plan;
  input.state.plan.selectedTopology = result.plan.selectedTopology;
  input.state.plan.morphogenesisDispatchAssignments = Object.values(result.assignments);
  input.state.plan.morphogenesisTransitions = [
    ...(input.state.plan.morphogenesisTransitions || []), result.receipt
  ];
  return result;
}

module.exports = { planContinuation, evidenceSignals, adaptationRequired, adaptiveExpression };
