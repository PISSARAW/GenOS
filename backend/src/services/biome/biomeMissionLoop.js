'use strict';

const biome = require('../biomeCoordinationService');

const STEPS = Object.freeze(['observe', 'propose', 'constrain', 'act', 'verify']);
const ADAPTERS = Object.freeze(['simulated', 'real']);

function fail(code, message) {
  return Object.assign(new Error(message), { code });
}

function checkSessionId(sessionId) {
  if (typeof sessionId !== 'string' || !sessionId) throw fail('BIOME_MISSION_ID_REQUIRED', 'sessionId is required.');
}

function checkBudget(mission) {
  const budget = Number(mission && mission.budget);
  if (!Number.isFinite(budget)) throw fail('BIOME_BUDGET_INVALID', 'mission.budget must be finite.');
  if (budget < 0) throw fail('BIOME_BUDGET_INVALID', 'mission.budget must be finite.');
  return budget;
}

function checkAdapter(mission) {
  const adapter = (mission && mission.adapter) || 'simulated';
  if (!ADAPTERS.includes(adapter)) throw fail('BIOME_ADAPTER_UNKNOWN', 'adapter must be simulated|real.');
  return adapter;
}

function missionContract(sessionId, mission) {
  checkSessionId(sessionId);
  const budget = checkBudget(mission);
  const adapter = checkAdapter(mission);
  const capabilities = (mission && mission.capabilities) || [];
  return { budget, adapter, capabilities: [...capabilities] };
}

function buildOpts(contract, options) {
  const authorize = options && options.authorize;
  const approved = !!(authorize && authorize());
  return { db: options && options.db, adapter: contract.adapter, simulated: contract.adapter === 'simulated', authorized: approved };
}

function receipt(sessionId, context, status) {
  const names = context.steps.map((item) => (item && item.step) || item);
  return { sessionId, status, adapter: context.contract.adapter, simulated: context.contract.adapter === 'simulated', steps: names, revisionRef: names.length };
}

function abstained(sessionId, context, reason) {
  return { ...receipt(sessionId, context, 'abstained'), reason, steps: context.steps };
}

function failedReceipt(sessionId, context, error) {
  return { ...receipt(sessionId, context, 'failed'), error: error.message, code: error.code, steps: context.steps };
}

async function observe(sessionId, context) {
  const snapshot = await biome.sessionSnapshot(sessionId, context.opts);
  context.steps.push({ step: 'observe', simulated: context.opts.simulated, output: { snapshot } });
}

async function propose(sessionId, mission, context) {
  const proposal = mission.proposal || {};
  const forage = await biome.forageSession(sessionId, proposal.patchHistory || [], context.opts);
  context.steps.push({ step: 'propose', simulated: context.opts.simulated, output: { forage } });
}

function constrain(mission, context) {
  const cost = Number((mission.proposal || {}).cost || 0);
  const check = cost > context.contract.budget
    ? { status: 'abstained', reason: `cost ${cost} exceeds budget ${context.contract.budget}` }
    : { status: 'satisfied', remaining: context.contract.budget - cost };
  context.steps.push({ step: 'constrain', ...check });
  return check;
}

async function act(sessionId, mission, context) {
  if (context.opts.adapter === 'real' && !context.opts.authorized) {
    const denied = { status: 'abstained', reason: 'real action requires explicit authorization' };
    context.steps.push({ step: 'act', ...denied });
    return denied;
  }
  const action = mission.action || {};
  const allocation = await biome.allocateSessionResources(sessionId, action.populations || [], context.opts);
  const applied = { status: 'applied', allocation, simulated: context.opts.simulated };
  context.steps.push({ step: 'act', ...applied });
  return applied;
}

async function verify(sessionId, mission, context) {
  const health = await biome.assessSessionHealth(sessionId, mission.observations || [], context.opts);
  context.steps.push({ step: 'verify', simulated: context.opts.simulated, output: { health } });
}

async function execute(sessionId, mission, context) {
  await observe(sessionId, context);
  await propose(sessionId, mission, context);
  const check = constrain(mission, context);
  if (check.status === 'abstained') return abstained(sessionId, context, check.reason);
  const acted = await act(sessionId, mission, context);
  if (acted.status === 'abstained') return abstained(sessionId, context, acted.reason);
  await verify(sessionId, mission, context);
  const statistical = await require('../morphogenesis/capabilities/statisticalPromotionGate')
    .evaluateForNode(context.opts.db, { nodeId: mission.riskNodeId || sessionId, contract: mission.statisticalContract });
  if (!statistical.allowed) return abstained(sessionId, context, statistical.reason);
  return { ...receipt(sessionId, context, 'completed'), steps: context.steps };
}

async function runBiomeMission(sessionId, mission, options) {
  let contract;
  try {
    contract = missionContract(sessionId, mission);
  } catch (error) {
    return { sessionId, status: 'failed', error: error.message, code: error.code, steps: [] };
  }
  const context = { contract, opts: buildOpts(contract, options), steps: [] };
  try {
    return await execute(sessionId, mission, context);
  } catch (error) {
    return failedReceipt(sessionId, context, error);
  }
}

module.exports = { runBiomeMission, missionContract, STEPS, ADAPTERS };
