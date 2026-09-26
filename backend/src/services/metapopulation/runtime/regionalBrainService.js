'use strict';

const metapopulationStore = require('../metapopulationStore');
const { inspectRegion } = require('../observability/regionalLivenessService');
const { analyzeContribution } = require('../observability/regionalContributionService');
const { planAntiSynchrony } = require('../observability/antiSynchronyService');
const { evaluateRegionalUtility } = require('../observability/regionalUtilityService');
const { transitionDeme } = require('../demes/demeLifecycleService');
const { transitionPatch } = require('../patches/patchLifecycleService');
const recolonizationService = require('../patches/recolonizationService');
const corridorStore = require('../migration/corridorStore');
const migrationStore = require('../migration/migrationStore');
const regionalMigrationLoop = require('./regionalMigrationLoopService');
const { runRegionalRuntime } = require('./regionalRuntimeService');
const variantController = require('./variantRegionalController');
const classicPatchRuntime = require('./classicPatchRuntimeService');

function createRegionalBrain(options = {}) {
  return {
    observe: (input) => observeRegion(input, options),
    diagnose: (observed, input) => diagnoseRegion(observed, input),
    plan: (diagnosis, observed, input) => planRegionalRuntimeActions({ diagnosis, observed, input, options }),
    execute: (...args) => executeRegionalActions({ plan: args[0], diagnosis: args[1], observed: args[2], input: args[3], options }),
    verify: (...args) => verifyRegionalActions({ execution: args[0], plan: args[1], diagnosis: args[2], observed: args[3], input: args[4], options })
  };
}

async function runAutonomousRegionalRuntime(input = {}, options = {}) {
  return runRegionalRuntime(input, { ...options, adapters: createRegionalBrain(options) });
}

async function observeRegion(input, options) {
  requireDb(options);
  const session = await metapopulationStore.loadSession(options.db, input.metapopulationId);
  if (!session) throw brainError('METAPOPULATION_SESSION_UNKNOWN', 'Unknown metapopulation session.');
  const [liveness, corridors, errorVectors, rescueAttempts] = await Promise.all([
    inspectRegion(input.metapopulationId, { ...options, now: input.now }),
    corridorStore.listGraph(options.db, input.metapopulationId), readErrorVectors(options.db, input.metapopulationId, session.demes),
    migrationStore.countRescueAttemptsByDeme(options.db, input.metapopulationId)
  ]);
  const demes = enrichDemes(session);
  const contribution = analyzeContribution(demes, corridors, input.contributionOptions || {});
  const synchrony = planAntiSynchrony({ demes, observations: errorVectors, threshold: input.synchronyThreshold });
  const utility = evaluateRegionalUtility({ demes, corridors, migrations: input.migrationCandidates || [] });
  const variantResolution = resolveSessionVariant(session);
  return { metapopulationId: input.metapopulationId, revision: session.revision, status: session.status,
    variant: variantResolution.variant, variantPolicy: variantResolution.policy,
    variantSelection: variantResolution.selection,
    demes, patches: session.patches, corridors, liveness, contribution, synchrony, utility, rescueAttempts };
}

function resolveSessionVariant(session) {
  if (session.variant) {
    return { variant: session.variant, policy: session.variantPolicy || {},
      selection: session.variantSelection || { method: 'persisted', confidence: 1, reasons: ['SESSION_VARIANT_PERSISTED'] } };
  }
  const { resolveMetapopulationVariant } = require('../policy/metapopulationPolicyService');
  const resolved = resolveMetapopulationVariant({ mission: session.mission, scope: session.scope });
  return { variant: resolved.variant, policy: resolved.policy, selection: { ...resolved.selection, method: 'legacy_mission_signals' } };
}

function diagnoseRegion(observed, input = {}) {
  const fitnessLimit = bounded(input.riskFitnessThreshold, 0.35);
  const livenessByDeme = new Map(observed.liveness.demes.map((deme) => [deme.demeId, deme.silence]));
  const atRisk = observed.demes.filter((deme) => needsAttention(deme, livenessByDeme, fitnessLimit))
    .map((deme) => ({ demeId: deme.demeId, reasons: attentionReasons(deme, livenessByDeme, fitnessLimit),
      protectedFromCull: contributionFor(observed.contribution, deme.demeId)?.protectedFromLocalCull || false }));
  const missingCapabilities = missingRegionalCapabilities(observed.demes, requiredCapabilities(input.requiredCapabilities));
  const vacantPatches = observed.patches.filter((patch) => ['VACANT', 'AVAILABLE'].includes(patch.status));
  return { atRisk, missingCapabilities, vacantPatches: vacantPatches.map((patch) => patch.patchId),
    synchronyPairs: observed.synchrony.affectedPairs, regionalCapacity: observed.utility.capacity,
    status: missingCapabilities.length ? 'CAPABILITY_GAP' : atRisk.length ? 'AT_RISK' : 'STABLE' };
}

function planRegionalActions(diagnosis, observed, input = {}) {
  const actions = diagnosis.atRisk.filter((item) => canMarkAtRisk(observed.demes, item.demeId))
    .map((item) => ({ type: 'MARK_DEME_AT_RISK', demeId: item.demeId, reasons: item.reasons }));
  const pairs = updatablePairs(observed, diagnosis.synchronyPairs, input);
  if (pairs.length) actions.push({ type: 'REGULATE_CORRIDORS', pairs,
    freeze: input.freezeCorrelatedCorridors === true || observed.variantPolicy?.firebreaks === true });
  const migration = regionalMigrationLoop.planMigrationAction({ input, observed });
  if (migration.action) actions.push(migration.action);
  return { actions, recommendations: buildRecommendations(diagnosis, observed, input), migrationAssessments: migration.assessments,
    observedRevision: observed.revision,
    diagnosis: diagnosis.status };
}

async function planRegionalRuntimeActions(context) {
  const { diagnosis, observed, input, options } = context;
  const plan = planRegionalActions(diagnosis, observed, input);
  const classicResult = await classicPatchRuntime.runClassicPatchCycle(observed, { ...input, now: input.now }, options);
  if (classicResult.cycled) plan.actions.push({ type: 'COLLAPSE_DETECTED_POPULATE_VACANCY', results: classicResult.results });
  return variantController.planVariantActions({ ...context, plan });
}

function buildRecommendations(diagnosis, observed, input = {}) {
  const recommendations = [];
  const now = input.now ? Date.parse(input.now) : Date.now();
  for (const deme of diagnosis.atRisk) {
    recommendations.push({ type: 'ASSESS_RESCUE', demeId: deme.demeId,
      protectedFromCull: deme.protectedFromCull, sourceCandidates: observed.demes.filter((item) => item.demeId !== deme.demeId && item.status === 'ACTIVE').map((item) => item.demeId) });
    const resident = observed.demes.find((item) => item.demeId === deme.demeId);
    const sla = observed.variantPolicy?.recoverySlaMs;
    const updated = Date.parse(resident?.updatedAt || '');
    if (Number.isFinite(sla) && Number.isFinite(updated) && now - updated > sla) {
      recommendations.push({ type: 'RECOVERY_SLA_BREACH', demeId: deme.demeId, slaMs: sla, atRiskSince: resident.updatedAt });
    }
  }
  for (const patchId of diagnosis.vacantPatches) recommendations.push({ type: 'ASSESS_RECOLONIZATION', patchId });
  if (diagnosis.missingCapabilities.length) recommendations.push({ type: 'REGIONAL_CAPABILITY_GAP', capabilities: diagnosis.missingCapabilities });
  return recommendations;
}

async function executeRegionalActions(context) {
  const { plan, diagnosis, observed, input, options } = context;
  const results = [];
  for (const action of plan.actions) results.push(await executeAction(action, context));
  return { completed: true, results, actionCount: results.length, noOp: results.length === 0,
    diagnosis: diagnosis.status, observedRevision: observed.revision };
}

async function executeAction(action, context) {
  const { input, options } = context;
  if (action.type === 'MARK_DEME_AT_RISK') {
    const deme = await transitionDeme({ sessionId: input.metapopulationId, demeId: action.demeId, status: 'AT_RISK' }, options);
    return { type: action.type, demeId: action.demeId, status: deme.status };
  }
  if (action.type === 'REGULATE_CORRIDORS') return regulateCorridors(action, context);
  if (action.type === 'MIGRATE_PROPAGULE') return regionalMigrationLoop.executeMigrationAction(action, context);
  const variantResult = await variantController.executeVariantAction(action, context);
  if (variantResult) return variantResult;
  throw brainError('REGIONAL_ACTION_UNSUPPORTED', `Unsupported regional action: ${action.type}`);
}

async function regulateCorridors(action, context) {
  const { input, options } = context;
  const graph = await corridorStore.listGraph(options.db, input.metapopulationId);
  const updated = graph.map((corridor) => adjustCorridor(corridor, action, input));
  const stored = await corridorStore.replaceGraph(options.db, input.metapopulationId,
    { topology: 'anti-synchrony', corridors: updated });
  return { type: action.type, affectedPairs: action.pairs.length,
    updatedCorridors: stored.filter((corridor) => action.pairs.some((pair) => pairMatches(pair, corridor))).length };
}


function adjustCorridor(corridor, action, input) {
  const pair = action.pairs.find((item) => pairMatches(item, corridor));
  if (!pair) return corridor;
  const risk = Math.max(corridor.homogenizationRisk, pair.risk);
  const freezeAt = bounded(input.freezeRiskThreshold, input.freezeCorrelatedCorridors === true ? 0.95 : 0.75);
  const freeze = action.freeze && risk >= freezeAt;
  const weight = pair.risk > corridor.homogenizationRisk
    ? corridor.weight * bounded(input.corridorReductionFactor, 0.5) : corridor.weight;
  return { ...corridor, enabled: freeze ? false : corridor.enabled,
    weight: Number(weight.toFixed(3)), homogenizationRisk: risk };
}


async function verifyRegionalActions(context) {
  const demesValid = await verifyDemeActions(context);
  const corridorsValid = await verifyCorridorActions(context);
  const migrationsValid = await regionalMigrationLoop.verifyMigrationActions(context);
  const variantValid = await variantController.verifyVariantActions(context);
  const topologyValid = await variantController.verifyTopologyActions(context);
  const firebreakValid = await variantController.verifyFirebreakActions(context);
  return { valid: context.execution.completed === true && demesValid && corridorsValid && migrationsValid && variantValid && topologyValid && firebreakValid,
    diagnosis: context.diagnosis.status, actionCount: context.plan.actions.length,
    regionalRevisionBefore: context.observed.revision, regionalTopologyUnchanged: true };
}

async function verifyDemeActions(context) {
  const actions = context.plan.actions.filter((action) => action.type === 'MARK_DEME_AT_RISK');
  const session = await metapopulationStore.loadSession(context.options.db, context.input.metapopulationId);
  return actions.every((action) => session.demes.some((deme) => deme.demeId === action.demeId && deme.status === 'AT_RISK'));
}

async function verifyCorridorActions(context) {
  const actions = context.plan.actions.filter((action) => action.type === 'REGULATE_CORRIDORS');
  const recoverActions = context.plan.actions.filter((action) => action.type === 'RECOVER_FIREBREAKS');
  if (!actions.length && !recoverActions.length) return true;
  const corridors = await corridorStore.listGraph(context.options.db, context.input.metapopulationId);
  const regulated = actions.every((action) => action.pairs.every((pair) => corridors.some((edge) =>
    pairMatches(pair, edge) && edge.homogenizationRisk >= pair.risk)));
  const recovered = recoverActions.every((action) => action.pairs.every((pair) => corridors.some((edge) =>
      pairMatches(pair, edge) && edge.enabled && edge.homogenizationRisk <= pair.risk)));
  return regulated && recovered;
}

function updatablePairs(observed, pairs, input) {
  const byKey = new Map(observed.corridors.map((edge) => [edgeKey(edge), edge]));
  return pairs.flatMap((pair) => [pair, { ...pair, sourceDemeId: pair.targetDemeId, targetDemeId: pair.sourceDemeId }]).filter((pair) => {
    const edge = byKey.get(`${pair.sourceDemeId}->${pair.targetDemeId}`);
    const firebreaks = input.freezeCorrelatedCorridors === true || observed.variantPolicy?.firebreaks === true;
    const coverageProtected = (input.freezeCorrelatedCorridors === true || observed.variantPolicy?.firebreaks === true) && (observed.contribution?.demes || [])
      .some((deme) => deme.uniqueCapabilities?.length && [pair.sourceDemeId, pair.targetDemeId].includes(deme.demeId));
    return edge && !coverageProtected && (pair.risk > edge.homogenizationRisk || firebreaks && edge.enabled);
  });
}

function needsAttention(deme, liveness, fitnessLimit) {
  const silence = liveness.get(deme.demeId);
  return ['DISCONNECTED', 'STALLED', 'CRASHED'].includes(silence) ||
    ['AT_RISK', 'STRESSED'].includes(deme.status) || fitnessValue(deme) < fitnessLimit;
}

function attentionReasons(deme, liveness, fitnessLimit) {
  const reasons = [];
  const silence = liveness.get(deme.demeId);
  if (['DISCONNECTED', 'STALLED', 'CRASHED'].includes(silence)) reasons.push(`LIVENESS_${silence}`);
  if (['AT_RISK', 'STRESSED'].includes(deme.status)) reasons.push(`DEME_${deme.status}`);
  if (fitnessValue(deme) < fitnessLimit) reasons.push('LOW_LOCAL_FITNESS');
  return reasons;
}

function canMarkAtRisk(demes, demeId) {
  return demes.some((deme) => deme.demeId === demeId && ['ACTIVE', 'STRESSED', 'ESTABLISHING'].includes(deme.status));
}

function enrichDemes(session) {
  const patches = new Map(session.patches.map((patch) => [patch.patchId, patch]));
  return session.demes.map((deme) => ({ ...deme, patchQuality: patches.get(deme.patchId)?.quality || 0,
    capabilities: capabilitiesOf(deme), localStrategies: deme.localStrategies }));
}

function capabilitiesOf(deme) {
  const members = Array.isArray(deme.members) ? deme.members : [];
  const memberCapabilities = members.flatMap((member) => Array.isArray(member?.capabilities) ? member.capabilities : []);
  const strategies = Array.isArray(deme.localStrategies) ? deme.localStrategies : [];
  return [...new Set([...memberCapabilities, ...strategies].filter((item) => typeof item === 'string'))];
}

function missingRegionalCapabilities(demes, required) {
  const supplied = new Set(demes.filter((deme) => !['COLLAPSED', 'QUARANTINED', 'DORMANT'].includes(deme.status))
    .flatMap((deme) => deme.capabilities));
  return required.filter((capability) => !supplied.has(capability));
}

function requiredCapabilities(value) { return Array.isArray(value) ? value : []; }

async function readErrorVectors(db, metapopulationId, demes) {
  const rows = await db.all(`SELECT event_type, payload_json FROM metapopulation_events
    WHERE metapopulation_id = ? ORDER BY sequence DESC LIMIT 32`, metapopulationId);
  const events = rows.reverse().map((row) => ({ type: row.event_type, payload: parsePayload(row.payload_json) }));
  return Object.fromEntries(demes.map((deme) => [deme.demeId, events.map((event) => eventAffectsDeme(event, deme.demeId) ? 1 : 0)]));
}

function eventAffectsDeme(event, demeId) {
  if (!['DEME_AT_RISK', 'DEME_BOUNDARY_VIOLATION', 'MIGRATION_REJECTED', 'MIGRATION_ROLLED_BACK'].includes(event.type)) return false;
  return Object.values(event.payload).includes(demeId);
}

function parsePayload(value) { try { return JSON.parse(value || '{}'); } catch (_) { return {}; } }
function fitnessValue(deme) { return Number(deme.fitness?.score ?? deme.fitness?.local ?? 1); }
function contributionFor(report, demeId) { return report.demes.find((deme) => deme.demeId === demeId); }
function pairMatches(pair, edge) { return pair.sourceDemeId === edge.sourceDemeId && pair.targetDemeId === edge.targetDemeId; }
function edgeKey(edge) { return `${edge.sourceDemeId}->${edge.targetDemeId}`; }
function bounded(value, fallback) { return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback; }
function requireDb(options) { if (!options.db) throw brainError('METAPOPULATION_DB_REQUIRED', 'Regional brain requires a database.'); }
function brainError(code, message) { return Object.assign(new Error(message), { code }); }

module.exports = { createRegionalBrain, runAutonomousRegionalRuntime, observeRegion,
  diagnoseRegion, planRegionalActions, planRegionalRuntimeActions, executeRegionalActions, verifyRegionalActions };
