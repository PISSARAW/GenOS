'use strict';

const { createHash } = require('node:crypto');
const registry = require('./workspaceReceiverRegistry');
const counterfactualGuard = require('./counterfactualCandidateGuard');

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex');
}

function ignored(reason) {
  return { consumed: false, changed: false, effectType: reason, artifactRefs: [] };
}

async function memoryReceiver(input) {
  if (input.phase === 'inspect') return { state: { frameId: input.frame.frameId } };
  if (!input.frame.activeGoal) return ignored('no_recall_goal');
  const recall = await require('../autobiographicalMemory/recallService').recallForSituation({ agentId: input.frame.agentId, goal: input.frame.activeGoal }, { topEpisodes: 3, topLessons: 3 }, input.db);
  const refs = [...recall.episodes, ...recall.lessons].map((item) => item.id).filter(Boolean);
  return { consumed: true, changed: false, effectType: 'episodic_recall', artifactRefs: refs };
}

async function worldModelReceiver(input) {
  if (input.phase === 'inspect') return { state: { frameId: input.frame.frameId, candidateId: input.candidate?.candidateId } };
  const candidate = input.candidate;
  if (!counterfactualGuard.mayWriteCanonicalWorld(candidate, input.frame)) return ignored(counterfactualGuard.rejectReason(candidate, input.frame));
  if (candidate?.content.semanticType !== 'action_consequence' || !candidate.content.artifactRef) return ignored('no_action_consequence');
  const before = await stateFor(input.db, input.frame.agentId, 'world_model');
  const outcome = await require('../worldModelService').observeTransition(input.db, input.frame.agentId, {
    actionId: candidate.content.artifactRef, success: candidate.measures.predictionError < 0.5,
    detail: candidate.content.compactPreview, observedState: candidate.content.observedState
  });
  const after = await stateFor(input.db, input.frame.agentId, 'world_model');
  return { consumed: outcome.matched, changed: outcome.matched, effectType: 'world_transition_observed', beforeStateHash: hash(before), afterStateHash: hash(after), artifactRefs: outcome.transitionId ? [outcome.transitionId] : [] };
}

async function selfReceiver(input) {
  if (input.phase === 'inspect') return { state: await require('../coreSelfService').loadCoreSelf(input.db, input.frame.agentId) };
  const candidate = input.candidate;
  if (!counterfactualGuard.mayWriteCanonicalWorld(candidate, input.frame)) return ignored(counterfactualGuard.rejectReason(candidate, input.frame));
  if (candidate?.content.semanticType !== 'action_consequence' || !candidate.content.artifactRef) return ignored('no_attributable_action');
  const before = await require('../coreSelfService').loadCoreSelf(input.db, input.frame.agentId);
  await require('../coreSelfService').recordAttribution(input.db, input.frame.agentId, {
    actionId: candidate.content.artifactRef, attributedToSelf: candidate.source.module === 'efference',
    predictionError: candidate.measures.predictionError
  });
  const after = await require('../coreSelfService').loadCoreSelf(input.db, input.frame.agentId);
  return { consumed: true, changed: true, effectType: 'self_world_attribution', beforeStateHash: hash(before), afterStateHash: hash(after), artifactRefs: [candidate.content.artifactRef] };
}

async function interoceptionReceiver(input) {
  if (input.phase === 'inspect') return { state: await stateFor(input.db, input.frame.agentId, 'agow_attention_policy') };
  const sensing = await require('../machineInteroceptionService').senseAgentRuntime(input.db, input.frame.agentId);
  if (!sensing.variables) return ignored('interoception_unavailable');
  const scope = await require('../developmentalBridge/developmentalScopeResolver')
    .resolveDevelopmentalScope(input.db, input.frame.agentId);
  if (scope) await require('../developmentalBridge/interoceptionBridge').recordCanonicalInteroception({
    db: input.db, agentId: input.frame.agentId, scope, sample: sensing
  });
  const mission = { executionPolicy: { requestedWorkers: 3, workerFanoutLimit: 3, allowFileEdits: true } };
  const posture = require('../allostaticPlanningService').applyMeasuredPosture(mission, sensing);
  const before = await stateFor(input.db, input.frame.agentId, 'agow_attention_policy');
  const policy = policyFromSensing(sensing.variables, mission.executionPolicy, posture);
  await persistFor({ db: input.db, agentId: input.frame.agentId, scope: 'agow_attention_policy', state: policy });
  return { consumed: true, changed: hash(before) !== hash(policy), effectType: 'allostatic_attention_policy', beforeStateHash: hash(before), afterStateHash: hash(policy), artifactRefs: [] };
}

function policyFromSensing(variables, executionPolicy, posture) {
  const integrity = Number(variables.integrity) || 0;
  const pressure = Math.max(Number(variables.context_pressure) || 0, Number(variables.stress) || 0);
  return {
    moduleBudget: executionPolicy.workerFanoutLimit < 3 ? 1 : 2,
    maxCost: pressure >= 0.8 ? 0.25 : pressure >= 0.6 ? 0.5 : 1,
    minimumEvidenceRefs: posture.selectedActions.includes('require_evidence_before_mutation') || integrity < 0.5 ? 2 : 0,
    measuredAt: Date.now(), source: 'machine_interoception', variables: { ...variables }
  };
}

async function metacognitionReceiver(input) {
  if (input.phase === 'inspect') return { state: await stateFor(input.db, input.frame.agentId, 'agow_meta_policy') };
  const before = await stateFor(input.db, input.frame.agentId, 'agow_meta_policy');
  const frame = input.frame;
  const minimumEvidenceRefs = frame.epistemicState.contradiction > 0 || frame.epistemicState.uncertainty >= 0.7
    ? Math.max(2, Number(before.minimumEvidenceRefs) || 0) : Number(before.minimumEvidenceRefs) || 0;
  const next = { minimumEvidenceRefs, lastFrameId: frame.frameId, updatedAt: Date.now() };
  await persistFor({ db: input.db, agentId: frame.agentId, scope: 'agow_meta_policy', state: next });
  return { consumed: true, changed: hash(before) !== hash(next), effectType: 'metacognitive_evidence_gate', beforeStateHash: hash(before), afterStateHash: hash(next), artifactRefs: [] };
}

async function morphogenesisReceiver(input) {
  const loaded = await require('./agowStatePersistenceService').load({
    scope: 'agow_morphogenesis_plans', agentId: input.frame.agentId, db: input.db
  });
  if (!loaded.state?.morphologyPatch) return ignored('no_morphogenesis_plan');
  if (input.phase === 'inspect') return { state: { planId: loaded.state.morphologyPatch.graph?.missionId || input.frame.agentId } };
  const result = await require('../morphogenesis/runtime/morphogenesisShadowAdapter')
    .runMorphogenesisShadow(loaded.state, { missionId: input.frame.agentId });
  return { consumed: true, changed: false, effectType: 'morphogenesis_shadow_preflight',
    artifactRefs: [input.frame.agentId], outcome: { decision: result.decision, committed: result.committed } };
}

async function resolveTerritory(db, agentId) {
  const row = await db.get('SELECT t.id FROM daemon_territories t JOIN agents a ON a.workspace_id = t.workspace_id WHERE a.id = ? ORDER BY t.id LIMIT 1', agentId);
  return row?.id || null;
}

async function daemonReceiver(input) {
  const territoryId = await resolveTerritory(input.db, input.frame.agentId);
  if (!territoryId) return ignored('no_daemon_territory');
  if (input.phase === 'inspect') return { state: await stateFor(input.db, input.frame.agentId, 'agow_daemon_policy') };
  const territory = await require('../daemon/daemonTerritoryInteroceptionService').senseTerritory(input.db, territoryId);
  const machine = await require('../machineInteroceptionService').senseAgentRuntime(input.db, input.frame.agentId);
  if (machine.status !== 'measured' || !machine.variables) return ignored('machine_interoception_unavailable');
  const pressures = require('../daemon/daemonTerritoryInteroceptionService').combinePressures(territory.variables, machine.variables);
  const before = await stateFor(input.db, input.frame.agentId, 'agow_daemon_policy');
  const next = { territoryId, variables: territory.variables, pressures, sampledAt: territory.sampledAt };
  await persistFor({ db: input.db, agentId: input.frame.agentId, scope: 'agow_daemon_policy', state: next });
  return { consumed: true, changed: hash(before) !== hash(next), effectType: 'daemon_territory_homeostasis',
    beforeStateHash: hash(before), afterStateHash: hash(next), artifactRefs: [territoryId] };
}

async function stateFor(db, agentId, scope) {
  return (await require('./agowStatePersistenceService').load({ scope, agentId, db })).state;
}

async function persistFor(options) {
  return require('./agowStatePersistenceService').save(options);
}

function ensureRegistered() {
  registry.register({ module: 'memory', handle: memoryReceiver });
  registry.register({ module: 'world_model', handle: worldModelReceiver });
  registry.register({ module: 'self_model', handle: selfReceiver });
  registry.register({ module: 'interoception', handle: interoceptionReceiver });
  registry.register({ module: 'metacognition', handle: metacognitionReceiver });
  registry.register({ module: 'morphogenesis', handle: morphogenesisReceiver });
  registry.register({ module: 'daemon', handle: daemonReceiver });
}

module.exports = { ensureRegistered };
