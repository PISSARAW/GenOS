'use strict';

const { compileExpression } = require('./graph/morphologyCompiler');
const expression = require('./expression/morphologyExpression');
const { bindGraphMission } = require('./morphogenesisMissionBinding');

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

function problemProfile(state, signals) {
  return {
    ...(state.plan.profile || {}),
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

function plannerContext(input, signals) {
  const { state, continuation, orchestratorId } = input;
  const mission = state.normalizedMission || {};
  return {
    currentState: { topology: currentTopology(state), agents: new Map(), currentMorphologyVersion:
      state.plan.morphogenesisPlan?.morphologyPatch?.graph?.version || 1 },
    problemProfile: problemProfile(state, signals),
    problem: mission.prompt || mission.currentTask || '',
    missionId: mission.missionId || orchestratorId,
    budget: { tokens: Number(continuation.pool || 0) },
    forceMorphologySelection: true,
    missionAssignments: []
  };
}

function rankedAlternative(plan, primary) {
  const rankings = plan.controlReceipt?.topology?.rankings || [];
  return rankings.find((entry) => entry.topology !== primary)?.topology || null;
}

function adaptiveExpression({ plan, state, signals, capacity }) {
  const primary = plan.selectedTopology;
  if (capacity < 2) return expression.topologyExpression(primary, plan.selectedVariant || null);
  const alternative = rankedAlternative(plan, primary) || currentTopology(state);
  if (!alternative || alternative === primary) return expression.topologyExpression(primary, plan.selectedVariant || null);
  const leaves = [expression.topologyExpression(primary), expression.topologyExpression(alternative)];
  if (signals.failures || signals.average < 60) return expression.competeExpression(leaves);
  if (signals.spread > 25) return expression.federateExpression(leaves, { quorum: 2 });
  return expression.sequenceExpression(leaves);
}

function compileAdaptiveGraph(input, outcome) {
  const { plan, state, signals } = outcome;
  const capacity = input.survivors.length;
  const expr = adaptiveExpression({ plan, state, signals, capacity });
  const current = state.plan.morphogenesisPlan?.morphologyPatch?.graph;
  const graph = compileExpression(expr, {
    missionId: input.state.normalizedMission?.missionId || input.orchestratorId,
    mission: input.state.normalizedMission?.prompt || '',
    globalBudget: { tokens: Number(input.continuation.pool || 0) },
    version: Number(current?.version || 0) + 1,
    status: 'proposed'
  });
  plan.morphologyExpression = expr;
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
      options: { activateOrganization: false, agentCount: input.survivors.length,
        missionId: mission.missionId || input.orchestratorId, variantId: node.variant || undefined }
    });
    const members = (composition.members || []).filter((member) => member.executionMode !== 'orchestrator');
    if (!members.length) throw new Error(`Topology '${node.topology}' has no continuation worker.`);
    components.push({ node, members });
  }
  return components;
}

function rebindAssignment(worker, component, index) {
  const exact = component.members.find((member) => member.workerKind === worker.workerKind);
  const role = component.members.find((member) => member.role === worker.role);
  const selected = exact || role || component.members[index % component.members.length];
  if (!selected) return null;
  return { ...selected, agentId: worker.agentId, workerId: worker.agentId,
    workerKind: worker.workerKind || selected.workerKind,
    workerArtifact: worker.workerArtifact || selected.workerArtifact,
    capabilities: worker.capabilities || selected.capabilities,
    morphologyNodeId: component.node.nodeId,
    morphologyTopology: component.node.topology, morphologyVariant: component.node.variant || null,
    morphologyComponentIndex: index };
}

function assignSurvivors(input, components) {
  if (!components.length || input.survivors.length < components.length) return null;
  const assignments = {};
  for (let index = 0; index < input.survivors.length; index += 1) {
    const survivor = input.survivors[index];
    const worker = input.state.workers.get(survivor.agentId) || {};
    const assignment = rebindAssignment(worker, components[index % components.length], index);
    if (!assignment) return null;
    assignments[survivor.agentId] = assignment;
  }
  return assignments;
}

function transitionReceipt(input, outcome) {
  const { plan, signals, assignments } = outcome;
  const previous = input.state.plan.morphogenesisPlan?.morphologyPatch?.graph;
  return {
    status: 'ADAPTED', reason: 'evidence_driven_continuation',
    fromGraph: previous ? { graphId: previous.graphId, version: previous.version } : null,
    toGraph: plan.morphologyGraphRef,
    selectedTopology: plan.selectedTopology,
    operator: plan.morphologyExpression.kind,
    evidence: signals,
    rebinds: Object.entries(assignments).map(([workerId, assignment]) => ({
      workerId, nodeId: assignment.morphologyNodeId, topology: assignment.morphologyTopology,
      role: assignment.role, workerKind: assignment.workerKind
    }))
  };
}

async function planContinuation(input, dependencies = {}) {
  const results = [...input.state.results.values()];
  const signals = evidenceSignals(results);
  if (!adaptationRequired(signals, input.state.normalizedMission || {})) {
    return { adapted: false, reason: 'adaptation_not_required', signals };
  }
  const planner = dependencies.planMorphogenesis
    || require('./morphogenesisPlannerService').planMorphogenesis;
  const plan = planner(plannerContext(input, signals));
  compileAdaptiveGraph(input, { plan, state: input.state, signals });
  const components = await composeComponents(input, plan, dependencies);
  const assignments = assignSurvivors(input, components);
  if (!assignments) return { adapted: false, reason: 'topology_rebind_unavailable', signals, plan };
  bindGraphMission(plan.morphologyPatch.graph, { assignments: Object.values(assignments) });
  const receipt = transitionReceipt(input, { plan, signals, assignments });
  input.state.plan.morphogenesisPlan = plan;
  input.state.plan.selectedTopology = plan.selectedTopology;
  input.state.plan.morphogenesisDispatchAssignments = Object.values(assignments);
  input.state.plan.morphogenesisTransitions = [
    ...(input.state.plan.morphogenesisTransitions || []), receipt
  ];
  return { adapted: true, assignments, plan, receipt, signals };
}

module.exports = { planContinuation, evidenceSignals, adaptationRequired, adaptiveExpression };
