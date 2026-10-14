'use strict';

const { withTransaction } = require('../../db');
const store = require('./storage');
const TYPES = new Set(['GENESIS', 'LEGACY_IMPORT', 'ACTIVATE', 'RELEASE', 'FORK', 'FORK_ORIGIN',
  'RESTORE', 'TRANSITION', 'OBSERVE', 'DECIDE', 'OUTCOME', 'RELATE', 'TERMINATE']);

async function ensure(db, input) {
  await store.ready(db);
  return withTransaction(db, async () => {
    const registration = await store.registration(db, input);
    let head = await store.head(db, input.agentId);
    if (head) {
      checkRegistration(head, registration);
      await drainChanges(db, head.agent_id);
      return store.head(db, head.agent_id);
    }
    await db.run(`INSERT INTO agent_identity_heads
      (agent_id, organization_id, project_id, kind, source_table) VALUES (?, ?, ?, ?, ?)`,
    input.agentId, registration.scope.organizationId, registration.scope.projectId, registration.kind, registration.sourceTable);
    const birth = await db.get('SELECT * FROM agent_identity_births WHERE agent_id = ?', input.agentId);
    const type = birth?.birth_kind === 'registered_birth' ? 'GENESIS' : 'LEGACY_IMPORT';
    await append(db, { agentId: input.agentId, expectedRevision: 0, type,
      operationId: 'genesis', payload: { registration, capturedAt: birth?.captured_at || null,
        initialState: birth?.initial_json ? JSON.parse(birth.initial_json) : null }, causalRefs: [] });
    if (terminal(registration.status)) await markTerminal(db, input.agentId);
    await drainChanges(db, input.agentId);
    return store.head(db, input.agentId);
  });
}

async function drainChanges(db, agentId) {
  const changes = await db.all(`SELECT * FROM agent_identity_changes
    WHERE agent_id = ? AND applied_revision IS NULL ORDER BY change_id`, agentId);
  for (const change of changes) {
    const head = await store.head(db, agentId);
    const event = await append(db, { agentId, expectedRevision: head.revision, type: 'TRANSITION',
      operationId: `registry-change:${change.change_id}`, payload: { source: 'registry_trigger',
        changeId: change.change_id, fields: JSON.parse(change.change_json) } });
    await db.run('UPDATE agent_identity_changes SET applied_revision = ? WHERE change_id = ?', event.revision, change.change_id);
    const fields = event.payload.fields;
    if (terminalFields(fields)) await markTerminal(db, agentId);
  }
}

function terminal(status) { return ['terminated', 'apoptosis', 'Apoptosis', 'APOPTOTIC'].includes(status); }
function terminalChange(change) { return change && (terminal(change.before) || terminal(change.after)); }
function terminalFields(fields) {
  return terminalChange(fields.status) || terminalChange(fields.health) || fields.deleted || fields.replaced
    || fields.is_apoptotic?.before === 1 || fields.is_apoptotic?.after === 1;
}
async function markTerminal(db, agentId) {
  await db.run("UPDATE agent_identity_heads SET life_state = 'terminal' WHERE agent_id = ?", agentId);
}

function checkRegistration(head, registration) {
  if (head.organization_id !== registration.scope.organizationId
    || head.project_id !== registration.scope.projectId || head.source_table !== registration.sourceTable) {
    store.fail('IDENTITY_REGISTRATION_CHANGED');
  }
}

function requestOf(input) {
  if (!TYPES.has(input.type) || !input.operationId) store.fail('IDENTITY_EVENT_INVALID');
  return { agentId: input.agentId, type: input.type, payload: input.payload || {},
    causalRefs: input.causalRefs || [], operationId: input.operationId };
}

async function verifyCauses(db, head, refs) {
  if (!Array.isArray(refs) || refs.length > 16) store.fail('IDENTITY_CAUSES_INVALID');
  for (const ref of refs) {
    const event = await db.get(`SELECT h.organization_id, h.project_id FROM agent_identity_events e
      JOIN agent_identity_heads h ON h.agent_id = e.agent_id WHERE e.event_hash = ?`, ref);
    if (!event || event.organization_id !== head.organization_id || event.project_id !== head.project_id) {
      store.fail('IDENTITY_CAUSE_UNVERIFIED');
    }
  }
}

async function append(db, input) {
  await store.ready(db);
  const request = requestOf(input);
  return withTransaction(db, async () => {
    const prior = await db.get('SELECT * FROM agent_identity_events WHERE agent_id = ? AND idempotency_key = ?',
      input.agentId, input.operationId);
    if (prior) {
      if (prior.request_hash !== store.hash(request)) store.fail('IDENTITY_IDEMPOTENCY_CONFLICT');
      return JSON.parse(prior.body_json);
    }
    const head = await store.head(db, input.agentId);
    if (!head || head.revision !== input.expectedRevision) store.fail('IDENTITY_REVISION_CONFLICT');
    await verifyCauses(db, head, request.causalRefs);
    const body = { ...request, revision: head.revision + 1, previousHash: head.head_hash,
      scope: { organizationId: head.organization_id, projectId: head.project_id }, at: new Date().toISOString() };
    const eventHash = store.hash(body);
    await db.run(`INSERT INTO agent_identity_events
      (event_hash, agent_id, revision, previous_hash, event_type, idempotency_key, request_hash, body_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, eventHash, input.agentId, body.revision, body.previousHash,
    input.type, input.operationId, store.hash(request), JSON.stringify(body));
    const changed = await db.run(`UPDATE agent_identity_heads SET revision = ?, head_hash = ?
      WHERE agent_id = ? AND revision = ?`, body.revision, eventHash, input.agentId, head.revision);
    if (changed.changes !== 1) store.fail('IDENTITY_REVISION_CONFLICT');
    return body;
  });
}

async function verify(db, agentId) {
  await store.ready(db);
  return withTransaction(db, () => verifyWithin(db, agentId));
}

async function verifyWithin(db, agentId) {
  await drainChanges(db, agentId);
  const head = await store.head(db, agentId);
  if (!head) return { valid: false, reason: 'UNREGISTERED' };
  const events = await db.all('SELECT * FROM agent_identity_events WHERE agent_id = ? ORDER BY revision', agentId);
  let previous = null;
  let revision = 0;
  for (const event of events) {
    const body = JSON.parse(event.body_json);
    if (body.agentId !== agentId || body.revision !== ++revision || body.previousHash !== previous
      || store.hash(body) !== event.event_hash) return { valid: false, reason: 'BROKEN_CHAIN' };
    await verifyCauses(db, head, body.causalRefs);
    previous = event.event_hash;
  }
  const valid = revision > 0 && revision === head.revision && previous === head.head_hash;
  return { valid, headHash: previous, revision, origin: events[0]?.event_type || null };
}

async function transition(db, input) {
  const head = await ensure(db, input);
  return append(db, { ...input, expectedRevision: input.expectedRevision ?? head.revision });
}

module.exports = { ensure, append, verify, transition };
