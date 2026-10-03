'use strict';

const trinityService = require('../src/services/trinityService');
const trinityMissionSupervisor = require('../src/services/trinityMissionSupervisor');
const topologyWorkerKinds = require('../src/services/topologyWorkerKindService');
const trinityAdapters = require('../src/services/trinityAdapters');
const factorial = require('../src/services/trinityFactorialGrid');

function workerAssignmentsFrom(context) {
  return context.request.worker_assignments || context.request.workerAssignments || {};
}

function trinityOptionsFrom(context) {
  return {
    variant: context.request.variant_id || context.request.variantId || context.request.variant,
    jury: context.request.trinity_jury || context.request.trinityJury,
    experimentalDesign: context.request.experimental_design || context.request.experimentalDesign,
    adaptiveBudgetConfig: context.request.trinity_adaptive_budget || context.request.trinityAdaptiveBudget,
    qdConfig: context.request.trinity_qd || context.request.trinityQD
  };
}

function trinityModels() {
  const raw = process.env.GENOS_TRINITY_MODELS || '';
  return raw.split(',').map((entry) => entry.trim()).filter(Boolean);
}

function assignModels(members, models) {
  if (!models.length) return members;
  return members.map((member, index) => ({ ...member, localModel: models[index % models.length] }));
}

function missionFrom(context) {
  return context.request.mission || context.request.project_goal || context.request.goal || 'Trinity comparative mission';
}

function composeMembers(mission, options, assignments) {
  const models = trinityModels();
  const composed = trinityService.compose(mission, {
    variantId: options.variant, experimentalDesign: options.experimentalDesign, trinityJury: options.jury,
    adaptiveBudgetConfig: options.adaptiveBudgetConfig,
    qdConfig: options.qdConfig,
    availableAdapters: trinityAdapters.dispatchAdapterNames(), trinityModels: models
  });
  const members = topologyWorkerKinds.applyTopologyWorkerKinds('trinity', assignModels(composed, models), assignments);
  return members[0]?.variantSelection?.experimentalDesign?.worldTopology === 'factorial_grid'
    ? expandFactorialMembers(members) : members;
}

function expandFactorialMembers(members) {
  const factors = { approach: ['direct', 'planned'], modelTier: ['standard', 'frontier'], validation: ['basic', 'deep'] };
  const grid = factorial.generateFactorialGrid({ factors, replications: 2, randomize: false });
  return grid.cells.map((cell, index) => factorialMember({ base: members[index % members.length], cell, worldNumber: index + 1 }));
}

function factorialMember(input) {
  const { base, cell, worldNumber } = input;
  const factors = cell.factors;
  const directive = `FACTORIAL CELL ${cell.cellId}: approach=${factors.approach}; modelTier=${factors.modelTier}; validation=${factors.validation}. Run this cell as an independent experiment. Return factorialCell {cellId, factors} exactly; cite measured evidence for the result.`;
  return { ...base, worldNumber, variantIndex: worldNumber - 1, modelTier: factors.modelTier,
    role: `${base.role}_${factors.approach}_${factors.validation}`,
    factorialCell: { cellId: cell.cellId, factors }, mission: `${base.mission}\n${directive}` };
}

async function handle(input) {
  const { db, context, ensureParent, workerGarage, buildNCEEnrichments, createOrchestratorId, launchWorker } = input;
  const parent = await ensureParent({ db, context });
  const garage = await workerGarage.state(db, context.orchestratorId);
  const mission = missionFrom(context);
  context.nceEnrichments = await buildNCEEnrichments(context, 'trinity');
  const assignments = workerAssignmentsFrom(context);
  const { variant, jury, experimentalDesign, adaptiveBudgetConfig, qdConfig } = trinityOptionsFrom(context);
  const members = composeMembers(mission, { variant, jury, experimentalDesign, adaptiveBudgetConfig, qdConfig }, assignments);
  if (garage.available < members.length) throw Object.assign(new Error(`Trinity design requires ${members.length} free worker slots`), { code: 'WORKER_GARAGE_FULL' });
  const missionId = context.request.trinityMissionId
    || `trinity_${context.orchestratorId}_${require('crypto').randomUUID()}`;
  const variantSelection = withDispatchRuntime(members, context.request);
  await persistDispatchConfig(db, { missionId, mission, variantSelection, juryConfig: jury });
  const accepted = await launchWorlds({ db, context, members, missionId, mission, parent, launchWorker, createOrchestratorId });
  const supervision = trinityMissionSupervisor.launch({
    missionId, orchestratorId: context.orchestratorId, repoRoot: context.repoRoot
  });
  process.stdout.write(JSON.stringify({ orchestratorId: context.orchestratorId, trinity: {
    status: 'accepted', mission, missionId, variant: members[0]?.variant,
    variantSelection: members[0]?.variantSelection,
    capacity: workerGarage.getDynamicCapacity(context.orchestratorId), worlds: accepted, supervision
  } }));
}

function withDispatchRuntime(members, request = {}) {
  const selection = members[0]?.variantSelection;
  if (!selection) return selection;
  return { ...selection,
    recursiveState: { depth: Math.max(0, Number(request.recursiveDepth) || 0),
      spentBudget: Math.max(0, Number(request.recursiveSpentBudget) || 0) },
    worldModelAssignments: members.map((member) => ({ worldNumber: member.worldNumber,
      modelTier: member.modelTier, localModel: member.localModel || null })),
    adaptiveBudgetConfig: request.trinity_adaptive_budget || request.trinityAdaptiveBudget || null,
    qdConfig: request.trinity_qd || request.trinityQD || null,
    workerExecutionPolicy: request.executionPolicy || null
  };
}

async function persistDispatchConfig(db, config) {
  await db.run(`INSERT INTO trinity_dispatch_configs
    (mission_id, mission, variant_selection_json, jury_config_json) VALUES (?, ?, ?, ?)`,
  config.missionId, config.mission, JSON.stringify(config.variantSelection || {}),
  config.juryConfig ? JSON.stringify(config.juryConfig) : null);
}

async function launchWorlds(input) {
  const { db, context, members, missionId, mission, parent, launchWorker, createOrchestratorId } = input;
  const accepted = [];
  for (const member of members) {
    const workerId = createOrchestratorId(`worker_${context.orchestratorId}_${member.worldNumber}`);
    const name = `Trinity Worker (World ${member.worldNumber}: ${member.label})`;
    await db.run(`INSERT INTO trinity_worlds (id, mission, world_number, name, strategy, status, agent_id)
      VALUES (?, ?, ?, ?, ?, 'queued', ?)`, `${missionId}_world_${member.worldNumber}`, mission,
    member.worldNumber, name, member.role, workerId);
    await launchWorker({ db, context, member: { ...member, name, missionScope: { missionId, chamber: member.chamber } }, index: member.worldNumber, parent, suppliedWorkerId: workerId });
    accepted.push({ workerId, worldNumber: member.worldNumber, strategy: member.role, status: 'accepted' });
  }
  return accepted;
}

module.exports = { handle };
