'use strict';

const { buildMissionMorphogenesisInput } = require('./missionMorphogenesis');
const { bindGraphMission } = require('../morphogenesis/morphogenesisMissionBinding');
const { morphogenesisWorkerAssignments } = require('../morphogenesisRolePrompt');

const DEDICATED_TOPOLOGIES = new Set(['trinity', 'a_team']);

function planner(dependencies) {
  return dependencies.planMorphogenesis
    || require('../morphogenesis/morphogenesisPlannerService').planMorphogenesis;
}

function hasNativeObjectives(mission = {}) {
  const objectives = mission.native_objectives || mission.nativeObjectives;
  return Array.isArray(objectives) && objectives.length > 0;
}

function topologyExplicitlyRequested(mission = {}) {
  if (typeof mission.userTopologyRequested === 'boolean') return mission.userTopologyRequested;
  const morphology = mission.morphology || {};
  const capabilityPlan = mission.missionCapabilityPlan || mission.mission_capability_plan || {};
  return [mission.topologyId, mission.topology_id, mission.proposedTopology, mission.proposed_topology,
    mission.morphologyTopology, mission.morphology_topology, morphology.topology, capabilityPlan.topology,
    mission.morphologyExpression, mission.morphology_expression, mission.morphology?.expression,
    mission.topologyContract?.mode, mission.topologyContract?.topology,
    mission.morphologyPlan?.selectedTopology, mission.trinityMode, mission.trinity_mode,
    mission.trinityVariantId, mission.trinity_variant_id, mission.trinityVariant, mission.variant_id]
    .some((value) => value !== undefined && value !== null && value !== '');
}

function shouldUseNativeMissionPlan(mission = {}) {
  return hasNativeObjectives(mission) && !topologyExplicitlyRequested(mission);
}

function nativeMissionPlanOwnsDispatch(mission, autonomyPlan) {
  return mission?.nativeMissionPlanOwnsDispatch === true
    && Boolean(autonomyPlan?.nativeMissionPlan);
}

function seedMorphogenesisSelection(ctx, dependencies = {}) {
  if (ctx.dispatchedAgent.execution_mode !== 'orchestrator') return null;
  ctx.normalizedMission.nativeMissionPlanOwnsDispatch = shouldUseNativeMissionPlan(ctx.normalizedMission);
  if (ctx.normalizedMission.nativeMissionPlanOwnsDispatch) return null;
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

function dedicatedPlanActive(ctx, topology) {
  const dedicated = topology === 'trinity' ? ctx.autonomyPlan.trinity : ctx.autonomyPlan.aTeam;
  return dedicated?.activated === true && ctx.autonomyPlan.dispatchWorkers?.length > 0;
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

function allocationFor(plan, workers, topology) {
  const policy = plan.tokenPolicy || {};
  fitWorkerShareToReserve(policy, workers.length);
  const budget = require('../aTeamDispatchBudgetService');
  budget.applyWorkerBudget(policy, workers);
  const allocation = policy.rounds;
  const count = workers.length;
  if (allocation.initial.workerCount === count) return allocation;
  throw activationError('MORPHOGENESIS_TOPOLOGY_BUDGET_INSUFFICIENT',
    `The mission budget cannot fund every '${topology}' worker.`,
    { topology, requiredWorkers: count, fundedWorkers: allocation.initial.workerCount });
}

function fitWorkerShareToReserve(policy, workerCount) {
  const total = Math.max(0, Number(policy.total) || 0);
  const requestedWorkerShare = Number(policy.workerShare);
  if (!total || !Number.isFinite(requestedWorkerShare)) return;
  const budgetPolicy = require('../workerTokenBudgetPolicy');
  const requiredReserve = budgetPolicy.minimumOrchestratorReserve(total, workerCount);
  const maximumWorkerShare = Math.max(0, (total - requiredReserve) / total);
  if (requestedWorkerShare <= maximumWorkerShare) return;
  policy.morphogenesisBudgetAdjustment = {
    reason: 'topology_worker_count_requires_minimum_orchestrator_reserve',
    requestedWorkerShare,
    appliedWorkerShare: maximumWorkerShare,
    requiredOrchestratorReserveTokens: requiredReserve
  };
  policy.workerShare = maximumWorkerShare;
  policy.orchestratorReserve = 1 - maximumWorkerShare;
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
    workerAssignments: morphogenesisWorkerAssignments(
      ctx.normalizedMission.workerAssignments || ctx.normalizedMission.worker_assignments,
      node.topology, ctx.normalizedMission.prompt || ctx.normalizedMission.currentTask),
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
  try {
    return await composeMode({
      db: ctx.db, orchestratorId: ctx.agentId, mode: node.topology,
      mission: ctx.normalizedMission.prompt || ctx.normalizedMission.currentTask || '',
      options: compositionOptions(ctx, morphologyPlan, node)
    });
  } catch (error) {
    if (error?.code === 'A_TEAM_MULTIDISCIPLINARY_REQUIRED') {
      throw activationError('MORPHOGENESIS_TOPOLOGY_INCOMPATIBLE', error.message, {
        topology: node.topology, causeCode: error.code
      });
    }
    throw error;
  }
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
  const allocation = allocationFor(ctx.autonomyPlan, workers, topology);
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
  require('../morphogenesis/morphogenesisGenomePlanBinding')
    .bindDispatchGenomeBindings(morphologyPlan, assignments);
  bindGraphMission(morphologyPlan.morphologyPatch.graph, {
    organization: ctx.autonomyPlan.organization,
    assignments
  });
  ctx.autonomyPlan.selectedTopology = morphologyPlan.selectedTopology;
  ctx.autonomyPlan.morphogenesisPlan = morphologyPlan;
  return assignments;
}

async function activateMorphogenesisPlan(ctx, morphologyPlan, dependencies = {}) {
  if (['blocked', 'candidate_required'].includes(morphologyPlan.genomeAdmission?.status)) {
    throw activationError('MORPHOGENESIS_GENOME_ADMISSION_PENDING',
      'Morphogenesis requires an evaluated and promoted genome before runtime activation.',
      { genomeAdmission: morphologyPlan.genomeAdmission });
  }
  const topology = morphologyPlan.selectedTopology;
  const nodes = topologyNodes(morphologyPlan);
  const dedicated = nodes.length === 1 && nodes[0].topology === topology
    && DEDICATED_TOPOLOGIES.has(topology);
  if (!dedicated || !dedicatedPlanActive(ctx, topology)) {
    await composeTopologyGraph(ctx, morphologyPlan, dependencies);
  }

  return bindSelectedPlan(ctx, morphologyPlan);
}

module.exports = { seedMorphogenesisSelection, activateMorphogenesisPlan, hasNativeObjectives,
  topologyExplicitlyRequested, shouldUseNativeMissionPlan, nativeMissionPlanOwnsDispatch };
