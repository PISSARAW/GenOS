'use strict';

const dynamicOrganization = require('../../dynamicOrganizationService');
const { unpackSignalPayload } = require('../../biomimeticSignalingBus');

async function buildTeamAudit(db, run, observed) {
  const [communications, relationships] = await Promise.all([
    loadCommunications(db, run.missionId),
    loadRelationships(db, run)
  ]);
  const errors = [communications.error, relationships.error].filter(Boolean);
  return {
    complete: errors.length === 0,
    identities: (run.members || []).map(identity),
    relationships: relationships.items,
    communications: communications.items,
    reports: reportEntries(observed.verdicts),
    errors
  };
}

function identity(member) {
  return { workerId: member.workerId, memberId: member.memberId,
    role: member.role, subSystem: member.subSystem || member.domain || null };
}

async function loadRelationships(db, run) {
  try {
    const states = await Promise.all((run.members || []).map((member) =>
      dynamicOrganization.getStateForMember(db, run.missionId, member.workerId)));
    return { items: states.map((state, index) => ({
      workerId: run.members[index].workerId,
      peers: (state?.communicationLinks || []).filter((link) => link.relationship !== 'reports_to')
    })), error: null };
  } catch (error) {
    return { items: [], error: auditError('relationships', error) };
  }
}

async function loadCommunications(db, orchestratorId) {
  try {
    const messages = await db.all(`SELECT id, sender_agent_id as senderAgentId,
      recipient_agent_id as recipientAgentId, channel, kind, content,
      payload_json as payloadJson, signal_type as signalType,
      signal_blob as signalBlob, delivery, created_at as createdAt
      FROM agent_organization_messages WHERE orchestrator_id = ? ORDER BY id`, orchestratorId);
    const receipts = await db.all(`SELECT receipt.message_id as messageId,
      receipt.recipient_agent_id as recipientAgentId, receipt.state,
      receipt.available_at as availableAt, receipt.read_at as readAt,
      receipt.acknowledged_at as acknowledgedAt
      FROM agent_organization_message_receipts receipt
      JOIN agent_organization_messages message ON message.id = receipt.message_id
      WHERE message.orchestrator_id = ? ORDER BY receipt.message_id, receipt.recipient_agent_id`, orchestratorId);
    return { items: messages.map((message) => communication(message, receipts)), error: null };
  } catch (error) {
    return { items: [], error: auditError('communications', error) };
  }
}

function communication(message, receipts) {
  return {
    id: message.id,
    senderAgentId: message.senderAgentId,
    recipientAgentId: message.recipientAgentId,
    channel: message.channel,
    kind: message.kind,
    content: message.content,
    payload: parseJson(message.payloadJson),
    signalType: message.signalType,
    signal: unpackSignal(message),
    delivery: message.delivery,
    createdAt: message.createdAt,
    receipts: receipts.filter((receipt) => receipt.messageId === message.id)
  };
}

function unpackSignal(message) {
  try {
    return unpackSignalPayload(message.signalBlob, message.signalType, message.payloadJson);
  } catch (_) {
    return null;
  }
}

function parseJson(value) {
  try { return value ? JSON.parse(value) : null; } catch (_) { return null; }
}

function reportEntries(verdicts) {
  return [...verdicts.entries()].map(([workerId, verdict]) => ({
    workerId,
    promoted: verdict.promoted === true,
    reason: verdict.reason || null,
    evidenceRefs: verdict.evidenceRefs || [],
    report: verdict.report || null
  }));
}

function auditError(section, error) {
  return { section, code: error.code || 'ATEAM_AUDIT_READ_FAILED', message: error.message };
}

module.exports = { buildTeamAudit, communication, reportEntries };
