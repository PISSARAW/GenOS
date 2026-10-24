'use strict';

const { getDatabase } = require('../../db');
const { DEFINITIONS } = require('../morphogenesis/registry/topologyRegistry');

async function recordTopologyTransition(req) {
  const db = await getDatabase();
  const agentId = String(req.body?.agentId || '');
  const eventId = String(req.body?.eventId || '');
  if (!agentId || !eventId) return { success: false, error: 'agentId and eventId are required.' };
  const event = await findCommittedEvent(db, req, agentId, eventId);
  if (!event) return { success: false, error: 'A committed topology transition event for this agent is required.' };
  const receipt = readTransitionReceipt(event.payload_json);
  if (!receipt.valid) return { success: false, error: receipt.error };
  const { createCommit } = require('./index');
  const result = await createCommit(req, {
    agentId,
    refName: req.body?.refName || 'main',
    metadata: { topologyTransition: receipt.transition, sourceEventId: event.event_id }
  });
  return { success: true, operation: 'record-topology-transition', sourceEventId: event.event_id, ...result };
}

async function findCommittedEvent(db, req, agentId, eventId) {
  const scope = req.tenant ? 'AND organization_id = ? AND project_id = ?' : '';
  const params = req.tenant ? [eventId, agentId, req.tenant.organizationId, req.tenant.projectId] : [eventId, agentId];
  return db.get(`SELECT event_id, payload_json FROM telemetry_events WHERE event_id = ? AND agent_id = ? AND event_type = 'MORPHOGENESIS_COMPLETED' ${scope}`, ...params);
}

function readTransitionReceipt(serialized) {
  let payload;
  try { payload = JSON.parse(serialized || '{}'); } catch (_) { return { valid: false, error: 'Transition payload is invalid JSON.' }; }
  const topology = String(payload.topology || '').toLowerCase();
  if (payload.committed !== true || !payload.transitionId || !DEFINITIONS[topology]) {
    return { valid: false, error: 'Transition receipt must be committed and name a registered topology and transitionId.' };
  }
  return { valid: true, transition: { topology, transitionId: payload.transitionId, commitId: payload.commitId || null, variantId: payload.variantId || null } };
}

module.exports = { recordTopologyTransition, readTransitionReceipt };
