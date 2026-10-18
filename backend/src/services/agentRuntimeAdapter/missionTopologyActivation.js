'use strict';

const { buildMissionMorphogenesisInput } = require('./missionMorphogenesis');
const { bindGraphMission } = require('../morphogenesis/morphogenesisMissionBinding');

const DEDICATED_TOPOLOGIES = new Set(['trinity', 'a_team']);

function planner(dependencies) {
  return dependencies.planMorphogenesis
    || require('../morphogenesis/morphogenesisPlannerService').planMorphogenesis;
}

function seedMorphogenesisSelection(ctx, dependencies = {}) {
  if (ctx.dispatchedAgent.execution_mode !== 'orchestrator') return null;
  const input = buildMissionMorphogenesisInput(ctx);
  const selection = planner(dependencies)(input);
  require('../morphogenesis/missionNosologyContext').bindNosology(selection, input.nosology);
  ctx.morphogenesisSelection = selection;
  ctx.normalizedMission.proposedTopology = selection.selectedTopology;
  ctx.normalizedMission.morphologyTopology = selection.selectedTopology;
  return selection;
}

function activationError(code, message, details = {}) {
  return Object.assign(new Error(message), { code, ...details });
}

function assertDedicatedPlan(ctx, topology) {
  const dedicated = topology === 'trinity' ? ctx.autonomyPlan.trinity : ctx.autonomyPlan.aTeam;
  if (dedicated?.activated === true && ctx.autonomyPlan.dispatchWorkers?.length) return;
  throw activationError('MORPHOGENESIS_TOPOLOGY_NOT_ACTIVATED',
    `Morphogenesis selected '${topology}', but its dedicated mission plan did not activate.`, { topology });
}

function executableMembers(composition, topology) {
  const members = Array.isArray(composition?.members) ? composition.members : [];
  const workers = members.filter((member) => member.executionMode !== 'orchestrator');
  if (workers.length) return workers;
  throw activationError('MORPHOGENESIS_TOPOLOGY_EMPTY',
    `Topology '${topology}' produced no executable worker assignment.`, { topology });
}

function assertFanout(plan, count, topology) {
  const limit = plan.survival?.constraints?.maxWorkerFanout;
  if (limit === null || limit === undefined || count <= limit) return;
  throw activationError('MORPHOGENESIS_TOPOLOGY_FANOUT_BLOCKED',
    `Topology '${topology}' requires ${count} workers, above the regulated fan-out ${limit}.`,
    { topology, requiredWorkers: count, availableWorkers: limit });
}

function allocationFor(plan, count, topology) {
  const policy = plan.tokenPolicy || {};
  const allocation = require('../tokenAllocationService').buildAllocation({
    totalTokens: policy.total,
    workerShare: policy.workerShare,
    workerCount: count,
    minimumWorkerTokens: policy.minimumWorkerTokens,
    mode: policy.allocation
  });
  if (allocation.initial.workerCount === count) return allocation;
  throw activationError('MORPHOGENESIS_TOPOLOGY_BUDGET_INSUFFICIENT',
    `The mission budget cannot fund every '${topology}' worker.`,
    { topology, requiredWorkers: count, fundedWorkers: allocation.initial.workerCount });
}

function topologyNodes(morphologyPlan) {
  const graph = morphologyPlan.morphologyPatch?.graph;
  return (graph?.nodes || []).filter((node) => node.topology
    && (node.kind === 'TOPOLOGY' || !node.operator));
}

function compositionOptions(ctx, morphologyPlan, node) {
  const variant = node.variant || morphologyPlan.selectedVariant;
  return {
    variantId: variant && variant !== 'default' ? variant : undefined,
    workerAssignments: ctx.normalizedMission.workerAssignments || ctx.normalizedMission.worker_assignments,
    agentCount: ctx.normalizedMission.morphology?.agents?.length,
    missionId: ctx.normalizedMission.missionId || ctx.agentId,
    configuration: ctx.normalizedMission.topologyConfiguration || ctx.normalizedMission.configuration,
    sessionOptions: ctx.normalizedMission.topologySessionOptions || ctx.normalizedMission.sessionOptions,
    activateOrganization: topologyNodes(morphologyPlan).length === 1
  };
}

async function composeTopologyNode(ctx, descriptor, dependencies) {
  const { morphologyPlan, node } = descriptor;
  const composeMode = dependencies.composeMode
    || require('../biologicalTopologyService').composeMode;
  return composeMode({
    db: ctx.db,
    orchestratorId: ctx.agentId,
    mode: node.topology,
    mission: ctx.normalizedMission.prompt || ctx.normalizedMission.currentTask || '',
    options: compositionOptions(ctx, morphologyPlan, node)
  });
}

function componentWorkers(composition, node, componentIndex) {
  return executableMembers(composition, node.topology).map((worker) => ({
    ...worker,
    morphologyNodeId: node.nodeId,
    morphologyTopology: node.topology,
    morphologyVariant: node.variant || null,
    morphologyComponentIndex: componentIndex
  }));
}

function applyCompositions(ctx, morphologyPlan, components) {
  const workers = components.flatMap((entry, index) => componentWorkers(entry.composition, entry.node, index));
  const topology = morphologyPlan.selectedTopology;
  assertFanout(ctx.autonomyPlan, workers.length, topology);
  const allocation = allocationFor(ctx.autonomyPlan, workers.length, topology);
  ctx.autonomyPlan.workers = workers;
  ctx.autonomyPlan.dispatchWorkers = workers;
  ctx.autonomyPlan.tokenPolicy.rounds = allocation;
  if (components.length === 1) {
    ctx.autonomyPlan.organization = components[0].composition.organization || ctx.autonomyPlan.organization;
    ctx.autonomyPlan.topologyComposition = components[0].composition;
  } else {
    if (ctx.autonomyPlan.trinity) ctx.autonomyPlan.trinity.activated = false;
    if (ctx.autonomyPlan.aTeam) ctx.autonomyPlan.aTeam.activated = false;
    ctx.autonomyPlan.topologyComposition = {
      kind: 'morphogenesis_composite',
      operator: morphologyPlan.morphologyPatch.graph.nodes
        .find((node) => node.nodeId === morphologyPlan.morphologyPatch.graph.rootNodeId)?.operator || null,
      components
    };
  }
}

async function composeTopologyGraph(ctx, morphologyPlan, dependencies) {
  const components = [];
  for (const node of topologyNodes(morphologyPlan)) {
    const descriptor = { morphologyPlan, node };
    components.push({ node, composition: await composeTopologyNode(ctx, descriptor, dependencies) });
  }
  if (!components.length) throw activationError('MORPHOGENESIS_TOPOLOGY_EMPTY',
    'Morphogenesis produced a graph without an executable topology component.');
  applyCompositions(ctx, morphologyPlan, components);
}

function bindSelectedPlan(ctx, morphologyPlan) {
  const assignments = ctx.autonomyPlan.dispatchWorkers || [];
  bindGraphMission(morphologyPlan.morphologyPatch.graph, {
    organization: ctx.autonomyPlan.organization,
    assignments
  });
  ctx.autonomyPlan.selectedTopology = morphologyPlan.selectedTopology;
  ctx.autonomyPlan.morphogenesisPlan = morphologyPlan;
  return assignments;
}

async function activateMorphogenesisPlan(ctx, morphologyPlan, dependencies = {}) {
  const topology = morphologyPlan.selectedTopology;
  const nodes = topologyNodes(morphologyPlan);
  const dedicated = nodes.length === 1 && nodes[0].topology === topology
    && DEDICATED_TOPOLOGIES.has(topology);
  if (dedicated) assertDedicatedPlan(ctx, topology);
  else await composeTopologyGraph(ctx, morphologyPlan, dependencies);
  return bindSelectedPlan(ctx, morphologyPlan);
}

module.exports = { seedMorphogenesisSelection, activateMorphogenesisPlan };
