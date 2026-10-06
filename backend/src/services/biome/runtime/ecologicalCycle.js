'use strict';

const variants = require('../variants/variantRuntimeService');
const environment = require('../environment/environmentModelService');
const discovery = require('../niches/nicheDiscoveryService');
const nicheStore = require('../niches/nicheStore');
const nicheLifecycle = require('../niches/nicheLifecycleService');
const populationRuntime = require('../populations/populationRuntimeService');
const steward = require('../resources/resourceStewardService');
const { createResourceVector } = require('../contracts/resourceVector');
const { sourceOpportunities } = require('../variants/variantSessionOperations');
const { ecologicalStop, positiveLimit } = require('./runtimePolicy');
const physiology = require('./populationPhysiology');
const observer = require('./ecosystemObserver');
const interactions = require('./ecologicalInteractions');
const biofilm = require('../../biofilmMatrixService');

async function advance(session, input, options) {
  validateInput(input);
  const ecology = session.ecology;
  const runtime = initializeRuntime(ecology, input, options);
  if (runtime.stopCondition) throw error('BIOME_RUNTIME_STOPPED', runtime.stopCondition);
  if (input.experimentWave) require('../../morphogenesis/capabilities/epistemicNicheRuntime')
    .assign(ecology, input.experimentWave, input.individuals || []);
  const actions = [];
  updateEnvironment(session, input, actions);
  discoverNiches(session, input, actions);
  await applyCommands(ecology, input.populationCommands || [], { options, actions });
  await physiology.colonize(ecology, input.individuals || [], actions);
  physiology.recordResults(session, input.populationResults || [], actions);
  const variant = decideVariant(session, input);
  actions.push(variant.action);
  actions.push(...interactions.update(ecology, input.interactions));
  allocate(ecology, input, actions);
  require('../variants/multiscaleController').enforceCaps(ecology);
  await physiology.regulate(ecology, input, { actions, options });
  runtime.tick += 1;
  const measurements = observer.measure(ecology);
  await verifyGoal(session, measurements, options);
  runtime.stopCondition = ecologicalStop(session, measurements);
  ecology.ecologicalState.health = measurements.health;
  ecology.status = runtime.goalVerification?.verified ? 'completed' : 'active';
  runtime.history = [...runtime.history, { tick: runtime.tick, variant: session.variant,
    decision: variant.decision, actions, measurements }].slice(-200);
  biofilm.deposit(session.matrix, { key: `cycle:${runtime.tick}`, kind: 'ecological_cycle',
    health: measurements.health, evidenceRefs: input.evidenceRefs || [],
    tippingPoints: measurements.tippingPoints });
  return { tick: runtime.tick, observations: measurements, decision: variant.decision,
    action: variant.action, actions, actionResult: { status: 'applied' }, measurements,
    shouldStop: Boolean(runtime.stopCondition), stopCondition: runtime.stopCondition,
    goalVerification: runtime.goalVerification || null };
}

function validateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw error('BIOME_INPUT_INVALID', 'A cycle input object is required.');
  const lists = ['populationCommands', 'populationResults', 'individuals', 'interactions', 'executions'];
  for (const key of lists) {
    if (input[key] !== undefined && (!Array.isArray(input[key]) || input[key].length > 100)) {
      throw error('BIOME_INPUT_INVALID', `${key} must contain at most 100 entries.`);
    }
  }
}

function initializeRuntime(ecology, input, options) {
  const runtime = ecology.ecologicalState.runtime || { tick: 0, budgetUsed: 0, history: [], resultIds: [] };
  ecology.ecologicalState.runtime = runtime;
  runtime.maxTicks = positiveLimit(runtime.maxTicks ?? options.maxTicks ?? 100);
  configureBudget(runtime, input);
  chargeCost(runtime, input.tokenCost ?? 0);
  return runtime;
}

function configureBudget(runtime, input) {
  if (runtime.budgetTotal === undefined && input.totalBudget !== undefined) {
    if (!Number.isSafeInteger(input.totalBudget) || input.totalBudget < 0) throw error('BIOME_BUDGET_INVALID', 'totalBudget must be a non-negative integer.');
    runtime.budgetTotal = input.totalBudget;
  }
}

function chargeCost(runtime, cost) {
  if (!Number.isSafeInteger(cost) || cost < 0) throw error('BIOME_BUDGET_INVALID', 'tokenCost must be a non-negative integer.');
  const nextUsed = runtime.budgetUsed + cost;
  if (runtime.budgetTotal !== undefined && nextUsed > runtime.budgetTotal) throw error('BIOME_BUDGET_EXCEEDED', 'Actual consumption exceeds the mission budget.');
  runtime.budgetUsed = nextUsed;
}

function updateEnvironment(session, input, actions) {
  if (!input.environmentPatch) return;
  const result = environment.applyEnvironmentUpdate({ environment: session.ecology.environment,
    patch: input.environmentPatch, reason: 'ecological cycle observation', evidenceRefs: input.evidenceRefs || [] });
  session.ecology.environment = result.environment;
  session.ecology.environmentConstraints = result.constraints.evaluations;
  session.ecology.opportunityMap = result.opportunities;
  actions.push({ type: 'ENVIRONMENT_VERSIONED', status: 'applied', version: result.environment.version });
}

function discoverNiches(session, input, actions) {
  const ecology = session.ecology;
  const candidates = discovery.discoverNiches({
    opportunityMap: [...ecology.opportunityMap, ...sourceOpportunities(session, input.knowledgeSources)],
    failureClusters: input.failureClusters || [], existingNiches: ecology.niches });
  for (const candidate of candidates) ecology.niches = nicheStore.upsertNiche(ecology.niches, candidate);
  ecology.niches = ecology.niches.map(n => nicheLifecycle.advanceNiche(n, {}, { minimumOpportunityScore: session.variantPolicy?.growthThreshold }));
  actions.push({ type: 'NICHES_DISCOVERED', status: 'applied', count: candidates.length });
}

async function applyCommands(ecology, commands, context) {
  for (const command of commands) {
    const result = await populationRuntime.execute(ecology, command, context.options);
    context.actions.push(result.action);
  }
}

function decideVariant(session, input) {
  const signals = require('./ecologicalSignals');
  signals.disturbance(session.ecology, input);
  const enriched = signals.enrich(session, input);
  const metrics = observer.measure(session.ecology);
  const result = variants.advance({ ecology: session.ecology, variant: session.variant,
    state: session.variantState || {}, matrix: session.matrix,
    input: { productivity: metrics.populations.totalProductivity, transition: true,
      ...enriched, resources: undefined, allocate: false } });
  session.variantState = result.state;
  chargeCost(session.ecology.ecologicalState.runtime, result.action.reserveUsed || 0);
  return result;
}

function allocate(ecology, input, actions) {
  const runtime = ecology.ecologicalState.runtime;
  const incoming = runtime.resourcesGranted ? createResourceVector() : createResourceVector(input.resources);
  const first = !runtime.resourcesGranted;
  runtime.resourcesGranted = true;
  physiology.reclaim(ecology);
  const signals = Object.fromEntries(ecology.populations.map(p => [p.populationId, {
    keystoneValue: 1 + (ecology.ecologicalState.keystoneValue?.[p.populationId] || 0),
    ...(input.productivitySignals?.[p.populationId] || {})
  }]));
  const result = steward.allocate(ecology, { resources: incoming, signals,
    reserveRatios: first ? input.reserveRatios ?? input.reserveRatio ?? 0.1 : 0 });
  actions.push({ type: 'ECOLOGICAL_RESOURCES_ALLOCATED', status: 'applied', allocations: result.allocations });
}

async function verifyGoal(session, measurements, options) {
  if (typeof options.verifyGoal !== 'function') return;
  const runtime = session.ecology.ecologicalState.runtime;
  const result = await require('./boundedInvocation').invoke(options.verifyGoal, structuredClone({ sessionId: session.sessionId,
    tick: runtime.tick, measurements, ecology: session.ecology }), options);
  runtime.goalVerification = goalReceipt(result, { sessionId: session.sessionId, tick: runtime.tick });
  const collapsed = measurements.populations.extinct > 0 && measurements.populations.active === 0;
  if (collapsed || ['stressed', 'incomplete'].includes(measurements.health)) runtime.goalVerification.verified = false;
}

function goalReceipt(result, expected) {
  const matched = result?.sessionId === expected.sessionId && result?.tick === expected.tick;
  const evidence = Array.isArray(result?.evidenceRefs) && result.evidenceRefs.some(ref => typeof ref === 'string' && ref.trim());
  return { verified: matched && evidence && result.verified === true, ...expected,
    evidenceRefs: evidence ? result.evidenceRefs : [] };
}

function error(code, message) { return Object.assign(new Error(message), { code }); }

module.exports = { advance };
