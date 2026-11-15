'use strict';

const biome = require('../biomeCoordinationService');
const { collectTopologyWorkerResults } = require('../morphogenesis/runtime/topologyWorkerResults');

async function execute(args, context) {
  const input = { ...(context.input || {}), variantId: requestedVariant(args, context) };
  const individuals = individualsFrom(args, input);
  const runtime = await biome.BiomeRuntime.create(missionText(args, input), sessionOptions(input));
  const cycles = await runtime.run({ ...input, ...budgetInput(input, context), individuals }, input.maxTicks ?? 100);
  const state = runtime.getState();
  const populations = state.ecology.populations;
  return { sessionId: runtime.sessionId, variant: runtime.variant, cycles,
    state, goalVerified: runtime.state.goalVerification?.verified === true,
    ecology: { niches: state.ecology.niches.length, populations: populations.length,
      individuals: populations.reduce((sum, p) => sum + p.individuals.length, 0) },
    actions: cycles.flatMap(cycle => cycle.actions || []),
    workerResults: collectTopologyWorkerResults(args.workers || [], input) };
}

function requestedVariant(args, context) {
  const requested = args.variant || context.input?.variantId;
  return requested && requested !== 'default' ? requested : undefined;
}

// The node's token share is the only budget the morphology runtime measures; it seeds the
// ecological pool unless the caller supplied explicit resources.
function budgetInput(input, context) {
  const tokens = Math.floor(Number(context.budget?.tokens));
  if (!Number.isSafeInteger(tokens) || tokens <= 0) return {};
  return { resources: input.resources ?? { tokens }, totalBudget: input.totalBudget ?? tokens };
}

function missionText(args, input) { return input.mission || args.mission || 'Biome mission'; }

function sessionOptions(input) {
  const environment = input.environment || { opportunities: [{ id: 'mission', descriptor: 'Mission work',
    opportunityScore: 1, justifiedUncertainty: 0.75, requiredCapabilities: [], resourceProfile: input.resourceProfile || {} }] };
  return { db: input.db, variant: input.variantId, environment, scope: input.scope,
    persistenceKey: input.persistenceKey, maxTicks: input.maxTicks ?? 100,
    missionId: input.missionId, producerId: input.producerId || input.missionId,
    verifyGoal: input.verifyGoal,
    executors: input.executors, authorizeExecution: input.authorizeExecution, verifyExecution: input.verifyExecution,
    executionTimeoutMs: input.executionTimeoutMs, signal: input.signal, deadline: input.deadline };
}

function individualsFrom(args, input) {
  const supplied = Array.isArray(input.individuals) ? input.individuals : [];
  const workers = (args.workers || []).map(worker => ({
    individualId: String(worker.workerId || worker.agentId || worker.id || ''),
    capabilities: worker.capabilities || [], role: worker.role || 'worker'
  })).filter(worker => worker.individualId);
  return [...new Map([...workers, ...supplied].map(i => [i.individualId, i])).values()];
}

module.exports = { execute };
