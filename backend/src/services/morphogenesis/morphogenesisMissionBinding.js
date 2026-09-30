'use strict';

function attachMissionAssignments(graph, assignments) {
  if (!Array.isArray(assignments) || !assignments.length) return;
  const root = graph.nodes.find((node) => node.nodeId === graph.rootNodeId);
  if (root) root.workers = assignments.map((assignment) => ({ ...assignment }));
}

function bindGraphOrganization(graph, organization) {
  if (!organization) return;
  const root = graph.nodes.find((node) => node.nodeId === graph.rootNodeId);
  if (root) root.organization = organization;
}

function bindGraphMission(graph, input) {
  bindGraphOrganization(graph, input.organization);
  attachMissionAssignments(graph, input.assignments);
}

function bindDispatchAssignments(autonomyPlan, assignments) {
  const originalCount = autonomyPlan.dispatchWorkers?.length || 0;
  reconcileDispatchBudget(autonomyPlan, originalCount, assignments.length);
  const graph = autonomyPlan.morphogenesisPlan?.morphologyPatch?.graph;
  if (!graph) return fallbackAssignments(autonomyPlan, assignments);
  const root = graph.nodes?.find((node) => node.nodeId === graph.rootNodeId);
  if (!root) throw invalidMorphologyGraph();
  return bindToRoot({ plan: autonomyPlan, graph, root, assignments });
}

function fallbackAssignments(plan, assignments) {
  plan.dispatchWorkers = assignments.map((assignment) => ({ ...assignment }));
  return { assignments: plan.dispatchWorkers, binding: null };
}

function invalidMorphologyGraph() {
  return Object.assign(new Error('Morphogenesis mission graph has no valid root node.'), {
    code: 'MORPHOGENESIS_MISSION_GRAPH_INVALID'
  });
}

function bindToRoot(input) {
  const { plan, graph, root, assignments } = input;
  root.workers = assignments.map((assignment) => ({ ...assignment }));
  const binding = {
    missionId: graph.missionId,
    graphId: graph.graphId,
    graphVersion: graph.version,
    rootNodeId: root.nodeId,
    selectedTopology: plan.morphogenesisPlan.selectedTopology || null,
    assignmentCount: root.workers.length,
    workerLabels: root.workers.map((worker) => worker.label || worker.role)
  };
  plan.morphogenesisPlan.missionBinding = binding;
  plan.dispatchWorkers = root.workers;
  return { assignments: root.workers, binding };
}

function reconcileDispatchBudget(plan, originalCount, selectedCount) {
  if (selectedCount >= originalCount) return;
  const policy = plan.tokenPolicy;
  if (!policy) return;
  policy.workerShare = selectedCount ? policy.workerShare : 0;
  policy.orchestratorReserve = selectedCount ? policy.orchestratorReserve : 1;
  policy.rounds = require('../tokenAllocationService').buildAllocation({
    totalTokens: policy.total,
    workerShare: policy.workerShare,
    workerCount: selectedCount,
    minimumWorkerTokens: policy.minimumWorkerTokens,
    mode: policy.allocation
  });
}

module.exports = { bindGraphMission, bindDispatchAssignments };
