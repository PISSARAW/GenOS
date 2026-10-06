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
const syncytiumMissionCompletion = require('../syncytiumMissionCompletionService.js');
const { topologyDetails } = require('./topologyDetails.cjs');

async function prepareBiologicalContext(db, context) {
  const parent = await ensureParent(db, context);
  const mode = String(context.request.mode || '').trim().toLowerCase();
  const mission = handleBiologicalMission(context);
  await persistBiologicalMissionTick({ db, context, parent, mission });
  context.nceEnrichments = await buildNCEEnrichments(context, 'biological');
  const composition = await composeBiologicalMode(db, context, mode, mission);
  if (mode === 'syncytium' && composition.sessionId) {
    context.topologySession = { sessionId: composition.sessionId, revision: composition.revision || 0 };
  }
  return { parent, mode, mission, composition };
}

async function dispatchAndValidate({ db, context, mode, parent, composition }) {
  const members = composition.members || [];
  const accepted = await dispatchAndCollectResults({ db, context, mode, parent, members });
  if (process.env.GENOS_TOPOLOGY_AWAIT_WORKERS === '1' && mode !== 'syncytium') {
    await biologicalWorkerCompletion.collectCompletedWorkerStatuses({ db, context, accepted });
  }
  const semanticValidation = mode === 'syncytium'
    ? await biologicalWorkerCompletion.validateSyncytiumResponses({ db, context, accepted,
      expectedCount: members.length, waitForWorkers: waitForMetapopulationWorkers })
    : null;
  return { members, accepted, semanticValidation };
}

async function finalizeBiologicalOutput({ db, context, mode, mission, members, accepted, composition, semanticValidation, parent }) {
  const topology = topologyDetails(composition);
  const out = buildBiologicalOutput({ context, mode, mission, members, accepted, topology });
  if (mode === 'syncytium' || process.env.GENOS_TOPOLOGY_AWAIT_WORKERS === '1') {
    out.biologicalMode.dispatchFailures = context.dispatchFailures || [];
  }
  await syncytiumMissionCompletion.validateAndComplete({ db, sessionId: composition.sessionId,
    output: out.biologicalMode, validation: semanticValidation, expectedCount: members.length });
  await applyRhizomeResults({ db, context, mode, topology, accepted, parent, output: out });
  process.stdout.write(JSON.stringify(out));
  return out;
}

async function handleBiological(db, context) {
  const { parent, mode, mission, composition } = await prepareBiologicalContext(db, context);
  const { members, accepted, semanticValidation } = await dispatchAndValidate({ db, context, mode, parent, composition });
  const out = await finalizeBiologicalOutput({ db, context, mode, mission, members, accepted, composition, semanticValidation, parent });
  if (handleBiologicalCondition(mode, out)) {
    throw Object.assign(new Error(`${mode} dispatch did not complete every required worker with valid evidence.`), { code: 'BIOLOGICAL_MISSION_INCOMPLETE' });
  }
}

module.exports = { handleBiological };