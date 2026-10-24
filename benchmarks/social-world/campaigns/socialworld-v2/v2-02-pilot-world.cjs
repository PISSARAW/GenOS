'use strict';

const { AGENT_COUNT, CYCLES, SCOPE, agentId, dayForCycle, digest } = require('./v2-02-pilot-contract.cjs');

async function createWorld(db) {
  const relations = require('../../../../backend/src/services/crossAgentRelationalService');
  await db.run('INSERT INTO organizations (id, name) VALUES (?, ?)', [SCOPE.organizationId, 'SocialWorld V2 pilot']);
  await db.run('INSERT INTO projects (id, organization_id, name) VALUES (?, ?, ?) ',
    [SCOPE.projectId, SCOPE.organizationId, 'SocialWorld V2 pilot']);
  await db.run(`INSERT INTO workspaces (id, name, path, organization_id, project_id)
    VALUES ('socialworld-v2-pilot-space', 'SocialWorld V2 pilot', 'simulated-world', ?, ?)`,
  [SCOPE.organizationId, SCOPE.projectId]);
  await createAgents(db);
  await createRing(db, relations);
}

async function createAgents(db) {
  for (let index = 0; index < AGENT_COUNT; index++) {
    await db.run(`INSERT INTO agents (id, name, role, status, execution_mode, workspace_id)
      VALUES (?, ?, 'worker', 'idle', 'worker', 'socialworld-v2-pilot-space')`, [agentId(index), agentId(index)]);
    await db.run(`INSERT INTO agent_expertise (agent_id, domain, competence, reliability, calibration)
      VALUES (?, ?, 0.95, 0.9, 0.9)`, [agentId(index), `navigation-${index}`]);
  }
}

async function createRing(db, relations) {
  for (const [index, edge] of ringEdges().entries()) {
    await relations.createRelation({ db, id: `socialworld-v2-pilot-edge-${index}`,
      ...edge, relationType: 'colleague', relationClass: 'organizational', ...SCOPE });
  }
}

function ringEdges() {
  return Array.from({ length: AGENT_COUNT }, (_, index) => {
    const sourceAgentId = agentId(index);
    const targetAgentId = agentId((index + 1) % AGENT_COUNT);
    return [{ sourceAgentId, targetAgentId }, { sourceAgentId: targetAgentId, targetAgentId: sourceAgentId }];
  }).flat();
}

async function ensureTransportTables(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS social_v2_pilot_inbox (
    signal_id TEXT NOT NULL, recipient_agent_id TEXT NOT NULL, sender_agent_id TEXT NOT NULL,
    event_id TEXT NOT NULL, content_json TEXT NOT NULL, received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (signal_id, recipient_agent_id))`);
}

function worldTransport(input) {
  return { deliver: async ({ decision, envelope, payload }) => {
    const recipients = decision.recipients || [];
    const refs = payload?.semanticRefs || [];
    const event = input.world.currentEvent;
    const knownAgents = new Set(Array.from({ length: AGENT_COUNT }, (_, index) => agentId(index)));
    if (recipients.length !== 1 || !recipients.every((id) => knownAgents.has(id))
      || refs.length === 0 || !event) return { published: false, signalId: envelope.messageId,
      acknowledgements: [], reason: 'simulated-recipient-rejected' };
    const inboxRows = [];
    for (const recipient of recipients) {
      await input.db.run(`INSERT INTO social_v2_pilot_inbox
        (signal_id, recipient_agent_id, sender_agent_id, event_id, content_json)
        VALUES (?, ?, ?, ?, ?)`, [envelope.messageId, recipient, event.agentId, event.eventId,
        JSON.stringify({ refs, publicSummary: payload.content?.content?.publicSummary || null })]);
      inboxRows.push(await input.db.get(`SELECT signal_id AS signalId, recipient_agent_id AS recipientAgentId
        FROM social_v2_pilot_inbox WHERE signal_id = ? AND recipient_agent_id = ?`, [envelope.messageId, recipient]));
    }
    if (inboxRows.some((row) => !row)) return { published: false, signalId: envelope.messageId,
      acknowledgements: [], reason: 'simulated-inbox-write-unverified' };
    input.world.scheduleReply(event, recipients[0], envelope.messageId);
    return { published: true, signalId: envelope.messageId,
      acknowledgements: recipients.map((recipientAgentId) => ({ recipientAgentId,
        groundingLevel: 'semantic_ack', status: 'acked',
        evidenceHash: digest({ signalId: envelope.messageId, recipientAgentId, refs }) })) };
  } };
}

function scheduleReply(input) {
  const { world, event, recipientAgentId, signalId } = input;
  if (event.isReply || event.cycle + 1 >= CYCLES) return;
  const reply = { cycle: event.cycle + 1, day: dayForCycle(event.cycle + 1),
    eventId: `${event.eventId}:reply`, agentId: recipientAgentId,
    summary: `${event.agentId} shared sourced help; decide whether to respond.`,
    domain: event.domain, evidenceRefs: [...event.evidenceRefs, signalId], isReply: true,
    replyToAgentId: event.agentId, sourceEventId: event.sourceEventId };
  const queued = world.pending.get(reply.cycle) || [];
  queued.push(reply);
  world.pending.set(reply.cycle, queued);
  world.evidenceRefs.add(signalId);
}

function worldState(db, events) {
  const eventIds = new Set(events.map((event) => event.eventId));
  const pending = new Map(events.reduce((map, event) => {
    map.set(event.cycle, [...(map.get(event.cycle) || []), event]); return map;
  }, new Map()));
  return { db, currentEvent: null, events: eventIds, pending,
    evidenceRefs: new Set(events.flatMap((event) => event.evidenceRefs)),
    scheduleReply(event, recipient, signalId) { scheduleReply({ world: this, event,
      recipientAgentId: recipient, signalId }); } };
}

function eventInput(event) {
  return { eventId: event.eventId, eventType: event.isReply ? 'SOCIAL_MESSAGE_RECEIVED' : 'WORLD_OBSERVATION',
    payload: { socialObservation: { id: event.eventId, summary: event.summary, domain: event.domain,
      evidenceRefs: event.evidenceRefs, urgency: 0.7, eventType: event.isReply ? 'social_reply' : 'social_observation' } } };
}

module.exports = { createWorld, ensureTransportTables, worldTransport, worldState, eventInput, ringEdges };
