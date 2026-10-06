'use strict';

const biome = require('../biomeCoordinationService');
const { collectTopologyWorkerResults } = require('../morphogenesis/runtime/topologyWorkerResults');

async function execute(args, context) {
  const input = { ...(context.input || {}), variantId: args.variant || context.input?.variantId };
  const individuals = individualsFrom(args, input);
  const runtime = await biome.BiomeRuntime.create(missionText(args, input), sessionOptions(input));
  const cycles = await runtime.run({ ...input, individuals }, input.maxTicks ?? 1);
  const state = runtime.getState();
  const populations = state.ecology.populations;
  return { sessionId: runtime.sessionId, variant: runtime.variant, cycles,
    state, goalVerified: runtime.state.goalVerification?.verified === true,
    ecology: { niches: state.ecology.niches.length, populations: populations.length,
      individuals: populations.reduce((sum, p) => sum + p.individuals.length, 0) },
    actions: cycles.flatMap(cycle => cycle.actions || []),
    workerResults: collectTopologyWorkerResults(args.workers || [], input) };
}

function missionText(args, input) { return input.mission || args.mission || 'Biome mission'; }

function sessionOptions(input) {
  const environment = input.environment || { opportunities: [{ id: 'mission', descriptor: 'Mission work',
    opportunityScore: 1, justifiedUncertainty: 0.75, requiredCapabilities: [], resourceProfile: input.resourceProfile || {} }] };
  return { db: input.db, variant: input.variantId, environment, scope: input.scope,
    persistenceKey: input.persistenceKey, maxTicks: input.maxTicks ?? 1, verifyGoal: input.verifyGoal,
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
