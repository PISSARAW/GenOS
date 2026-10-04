'use strict';

const { createHash } = require('node:crypto');
const ledger = require('../gvxDevelopmentLedger');
const controller = require('../gvxDevelopmentController');

function requestId(input) {
  const key = [input.scope.organizationId, input.projectId, input.entityId, input.observationId].join('\0');
  return `shev-signal:${createHash('sha256').update(key).digest('hex')}`;
}

function validRequest(input) {
  return input?.projectId && input.observationId && input.entityId
    && input.scope?.organizationId && input.scope.projectId === input.projectId;
}

async function requestDevelopment(db, input) {
  if (!validRequest(input)) throw new TypeError('SHEV development request requires a matching GVX scope.');
  const observation = await db.get(`SELECT o.*, i.kind AS initiative_kind
    FROM shev_observations o JOIN shev_initiatives i
      ON i.project_id = o.project_id AND i.observation_id = o.id
    WHERE o.project_id = ? AND o.id = ?`, [input.projectId, input.observationId]);
  if (!observation || observation.kind !== 'capability_gap' || observation.initiative_kind !== 'learn'
    || observation.epistemic_status !== 'observed'
    || (observation.valid_until && Date.parse(observation.valid_until) <= Date.now())) {
    throw new Error('SHEV capability gap lacks current evidence.');
  }
  const evidenceRefs = JSON.parse(observation.evidence_json);
  const scope = { ...input.scope, entityId: input.entityId };
  const id = requestId(input);
  let signal = await ledger.getEvent(db, id, scope);
  if (!signal) signal = await ledger.appendEvent(db, {
    id, ...input.scope, entityId: input.entityId, type: 'evidence_attached',
    payload: { kind: 'developmental_signal', sourceSystem: 'shev',
      sourceEventId: input.observationId, signalType: 'skill_gap',
      evidenceRefs, epistemicStatus: 'reported',
      context: { dimension: observation.dimension, projectId: input.projectId } }
  });
  const action = await controller.processSignal(db, { scope: input.scope, entityId: input.entityId,
    sourceEventId: input.observationId, signalType: 'skill_gap', evidenceRefs,
    context: { pathwayId: `shev:${observation.dimension}` } });
  return { signal, action, promotionAllowed: false };
}

module.exports = { requestDevelopment };
