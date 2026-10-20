'use strict';

const { persistBiologicalMissionTick } = require('./biologicalMissionPersist.cjs');
const { dispatchAndCollectResults } = require('./dispatchCollector.cjs');
const { buildBiologicalOutput } = require('./biologicalOutputBuilder.cjs');
const { applyRhizomeResults } = require('./rhizomeResultsApplier.cjs');
const { handleBiologicalCondition, handleBiologicalMission } = require('./biologicalConditions.cjs');
const { ensureParent } = require('./parentEnsurer.cjs');
const { buildNCEEnrichments } = require('./nceEnrichmentBuilder.cjs');
const { composeBiologicalMode } = require('./biologicalModeComposer.cjs');
const biologicalWorkerCompletion = require('../biologicalWorkerCompletionService.js');
const { waitForMetapopulationWorkers } = require('./metapopulationWaiter.cjs');
const biologicalMissionCompletion = require('../biologicalMissionCompletionService.js');
const { topologyDetails } = require('./topologyDetails.cjs');
const workerResultReader = require('./workerResultReader.cjs');
const dispatchEnvelope = require('./biologicalDispatchEnvelope.cjs');

async function prepareBiologicalContext(db, context) {
  const parent = await ensureParent({ db, context });
  const mode = String(context.request.mode || '').trim().toLowerCase();
  const mission = handleBiologicalMission(context);
  await persistBiologicalMissionTick({ db, context, parent, mission });
  context.nceEnrichments = await buildNCEEnrichments(context, 'biological');
  const composition = await composeBiologicalMode({ db, context, mode, mission });
  if (composition.sessionId) {
    context.topologySession = { sessionId: composition.sessionId, revision: composition.revision || 0 };
  }
  return { parent, mode, mission, composition };
}

async function dispatchAndValidate({ db, context, mode, parent, composition }) {
  const members = composition.members || [];
  const accepted = await dispatchAndCollectResults({ db, context, mode, parent, members });
  if (mode !== 'syncytium') {
    await biologicalWorkerCompletion.collectCompletedWorkerStatuses({ db, context, accepted });
  }
  const semanticValidation = mode === 'syncytium'
    ? await biologicalWorkerCompletion.validateSyncytiumResponses({ db, context, accepted,
      expectedCount: members.length, waitForWorkers: waitForMetapopulationWorkers })
    : undefined;
  await workerResultReader.readAll(db, { members: accepted, missionId: context.missionId });
  return { members, accepted, semanticValidation };
}

async function finalizeBiologicalOutput({ db, context, mode, mission, members, accepted, composition, semanticValidation, parent }) {
  const topology = topologyDetails(composition);
  const out = buildBiologicalOutput({ context, mode, mission, members, accepted, topology });
  out.biologicalMode.dispatchFailures = context.dispatchFailures || [];
  await applyRhizomeResults({ db, context, mode, topology, accepted, parent, output: out });
  await biologicalMissionCompletion.complete({ db, missionId: context.missionId, mode,
    sessionId: composition.sessionId, output: out.biologicalMode,
    validation: semanticValidation, expectedCount: members.length });
  return out;
}

async function handleBiological(db, context) {
  if (context.request.execute_round === true || context.request.community_id) {
    const result = await require('../topologyMcpTools.js').composeBiologicalMode({
      ...context.request, mode: context.request.mode,
      orchestrator_id: context.orchestratorId
    }, { agentId: context.orchestratorId });
    return result;
  }
  const { parent, mode, mission, composition } = await prepareBiologicalContext(db, context);
  const { members, accepted, semanticValidation } = await dispatchAndValidate({ db, context, mode, parent, composition });
  const out = await finalizeBiologicalOutput({ db, context, mode, mission, members, accepted, composition, semanticValidation, parent });
  const envelope = dispatchEnvelope.build({ missionId: context.missionId, mode, output: out });
  if (handleBiologicalCondition(mode, out) || !envelope.success) {
    throw dispatchEnvelope.incompleteError(envelope);
  }
  return envelope;
}

module.exports = { handleBiological };
