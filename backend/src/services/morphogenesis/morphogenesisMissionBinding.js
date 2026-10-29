'use strict';

function attachMissionAssignments(graph, assignments) {
  if (!Array.isArray(assignments) || !assignments.length) return;
  const root = graph.nodes.find((node) => node.nodeId === graph.rootNodeId);
  const topologyNodes = graph.nodes.filter((node) => node.kind === 'TOPOLOGY'
    || (node.topology && !node.operator));
  const tagged = assignments.every((assignment) => assignment.morphologyNodeId);
  if (!tagged || topologyNodes.length <= 1) {
    if (root) root.workers = assignments.map((assignment) => ({ ...assignment }));
    return;
  }
  for (const node of topologyNodes) {
    node.workers = assignments.filter((assignment) => assignment.morphologyNodeId === node.nodeId)
      .map((assignment) => ({ ...assignment }));
  }
  if (root?.kind !== 'TOPOLOGY') root.workers = [];
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
  const failures = runtimeCeilingFailures(autonomyPlan, assignments);
  if (failures.length) return blockRuntimeCeilingAssignments(autonomyPlan, assignments, failures);
  reconcileDispatchBudget(autonomyPlan, originalCount, assignments.length);
  const graph = autonomyPlan.morphogenesisPlan?.morphologyPatch?.graph;
  if (!graph) return fallbackAssignments(autonomyPlan, assignments);
  const root = graph.nodes?.find((node) => node.nodeId === graph.rootNodeId);
  if (!root) throw invalidMorphologyGraph();
  return bindToRoot({ plan: autonomyPlan, graph, root, assignments });
}

function runtimeCeilingFailures(plan, assignments) {
  const policy = plan.tokenPolicy || {};
  const minimum = policy.minimumWorkerTokensExplicit ? policy.minimumWorkerTokens : undefined;
  return require('../workerTokenBudgetPolicy').profileWorkers(assignments, minimum)
    .filter(profile => profile.runtimeCeilingExceeded)
    .map(profile => ({ workerKind: profile.workerKind, role: profile.role,
      requestedMinimumTokens: profile.minimumStartTokens,
      runtimeMaximumTokens: profile.runtimeMaximumTokens }));
}

function blockRuntimeCeilingAssignments(plan, assignments, failures) {
  plan.tokenPolicy = plan.tokenPolicy || {};
  const admission = { ...(plan.tokenPolicy.admission || {}), atomic: true, valid: false,
    requestedWorkers: assignments.length, fundedWorkers: 0,
    reason: 'worker_minimum_exceeds_runtime_ceiling', runtimeCeilingFailures: failures };
  plan.tokenPolicy.admission = admission;
  plan.dispatchWorkers = [];
  plan.morphogenesisDispatchAssignments = [];
  plan.dispatchDecision = require('../autonomousOrchestrationService/dispatchDecision')
    .buildDispatchDecision(plan.workers || assignments, [], admission);
  plan.exploration = require('../autonomousOrchestrationService/dispatchDecision')
    .buildExploration(plan.workers || assignments, []);
  return { assignments: [], binding: { blocked: true, reason: admission.reason,
    runtimeCeilingFailures: failures }, admissionBlocked: true };
}

function bindDispatchResults(autonomyPlan, workers, results) {
  const graph = autonomyPlan.morphogenesisPlan?.morphologyPatch?.graph;
  const root = graph?.nodes?.find((node) => node.nodeId === graph.rootNodeId);
  const assignments = autonomyPlan.morphogenesisDispatchAssignments || root?.workers || [];
  const reports = new Map((results || []).map((result) => [result.workerId, result.evidenceReport]));
  autonomyPlan.workerResults = results || [];
  if (!root) return;
  const bound = bindResultAssignments(assignments, workers || [], reports);
  attachMissionAssignments(graph, bound);
  root.workerResults = autonomyPlan.workerResults;
}

function bindResultAssignments(assignments, workers, reports) {
  const actualWorkers = new Map(workers.map((worker) => [worker.agentId, worker]));
  return assignments.map((assignment, index) => {
    const workerId = assignment.agentId || assignment.workerId;
    const worker = actualWorkers.get(workerId) || workers[index];
    return bindWorkerResult({ assignment, worker, report: reports.get(worker?.agentId || workerId) });
  }).filter(Boolean);
}

function bindWorkerResult(input) {
  const { assignment = {}, worker, report } = input;
  if (!worker) return null;
  return {
    ...assignment, ...worker,
    capabilities: worker.capabilities?.length ? worker.capabilities : assignment.capabilities || [],
    artifactType: report?.workerArtifact?.type || assignment.artifactType || null,
    evidenceReport: report || null
  };
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
  attachMissionAssignments(graph, assignments);
  plan.morphogenesisDispatchAssignments = assignments.map((assignment) => ({ ...assignment }));
  const components = graph.nodes.filter((node) => (node.kind === 'TOPOLOGY'
    || (node.topology && !node.operator)) && node.workers?.length)
    .map((node) => ({ nodeId: node.nodeId, topology: node.topology, assignmentCount: node.workers.length }));
  const binding = {
    missionId: graph.missionId,
    graphId: graph.graphId,
    graphVersion: graph.version,
    rootNodeId: root.nodeId,
    selectedTopology: plan.morphogenesisPlan.selectedTopology || null,
    assignmentCount: assignments.length,
    workerLabels: assignments.map((worker) => worker.label || worker.role),
    components
  };
  plan.morphogenesisPlan.missionBinding = binding;
  plan.dispatchWorkers = assignments.map((assignment) => ({ ...assignment }));
  return { assignments: plan.dispatchWorkers, binding };
}

function reconcileDispatchBudget(plan, originalCount, selectedCount) {
  const policy = plan.tokenPolicy;
  if (!policy) return;
  const allocatedCount = policy.rounds?.initial?.workerCount
    ?? policy.rounds?.initial?.workerTokens?.length;
  if (selectedCount >= originalCount
      && (allocatedCount == null || allocatedCount === selectedCount)) return;
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

module.exports = { bindGraphMission, bindDispatchAssignments, bindDispatchResults };
