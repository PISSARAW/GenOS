'use strict';
const crypto = require('node:crypto');
const { agent, failure } = require('./studioWorldsService');
const input = require('./studioSpecialistInput');
const sensors = require('./perception/sensorRegistryService');

function cognitiveReceipt(receipt) {
  const { receiptHash, ...payload } = receipt;
  const hash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  return { id: receipt.eventId, createdAt: receipt.createdAt, receiptHash,
    integrityChecked: hash === receiptHash, concepts: receipt.concepts, causal: receipt.causal,
    recordedPromotion: receipt.promotion, source: 'persisted_runtime_receipt' };
}

async function inspect(db, context) {
  const current = await agent(db, context);
  const store = new (require('./adaptiveStateService').AdaptiveStateService)(db);
  const state = await store.restoreObject('concept_runtime', current.id);
  return { agentId: current.id, sensors: sensors.listSensors(),
    indicators: require('./conceptRuntimeService').CONCEPTS.map(id => ({ id, status: state ? 'inspect_receipts' : 'not_run' })),
    receipts: (state?.receipts || []).slice(-32).map(cognitiveReceipt),
    causalEstablished: false, subjectiveConsciousnessEstablished: false, promotionGranted: false,
    source: state ? 'persisted_runtime_receipts' : 'no_runtime_receipts', sensorAvailability: 'not_assessed' };
}

async function plan(db, context) {
  await agent(db, context);
  const topic = input.text(context.body.topic, 200);
  const budget = input.number(context.body.budget, [0, 10]);
  const result = require('./perception/activePerceptionPlannerService').planProbes({
    unknowns: [{ topic }], capabilities: ['read'], domain: 'code', budget });
  return input.record(db, context, { mechanism: 'active_perception_plan', input: { topic, budget },
    result: { ...result, inputAuthority: 'declared', planningOnly: true, runtimeApplied: false, sensorAvailability: 'not_assessed' } });
}

async function probe(db, context) {
  const current = await agent(db, context);
  const path = input.text(context.body.path, 500);
  const workspace = await db.get('SELECT * FROM workspaces WHERE id = ? AND organization_id = ? AND project_id = ?',
    current.workspace_id, context.scope.organizationId, context.scope.projectId);
  if (!workspace) throw failure('WORKSPACE_NOT_FOUND', 404);
  let file;
  try { file = require('./studioFilesService').read(workspace, path); }
  catch (error) { error.status ||= error.code === 'ENOENT' ? 404 : 400; throw error; }
  const observation = require('./perception/observationService').makeObservation({ agentId: current.id, sensorId: 'filesystem',
    data: { path: file.path, version: file.version, bytes: Buffer.byteLength(file.content) } });
  observation.informationGain = null;
  return input.record(db, context, { mechanism: 'filesystem_observation', input: { path },
    result: { observation, path: file.path, version: file.version, bytes: observation.data.bytes,
      inputAuthority: 'workspace_observed', informationGain: null, runtimeApplied: false } });
}

module.exports = { inspect, plan, probe };
