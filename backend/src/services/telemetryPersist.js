/**
 * Telemetry persistence worker — drains the observer persist queue one event
 * at a time. Extracted from telemetryObserver so the queue loop stays under
 * the complexity gate; the observer delegates here (fine delegation).
 */

const crypto = require('crypto');
const { getDatabase } = require('../db');

const PROVENANCE_TYPES = new Set([
  'BELIEF_CREATED', 'BELIEF_UPDATED', 'AGENT_COMPLETED', 'AGENT_FAILED',
  'TOOL_CALL_COMPLETED', 'MCTS_NODE_PRUNED', 'EVALUATION_COMPLETED'
]);

function errorMessage(error) {
  if (error && error.message) return String(error.message);
  return '';
}

function isDbClosedError(error) {
  const message = errorMessage(error);
  return message.includes('SQLITE_MISUSE') || message.includes('Database handle is closed') || message.includes('cannot operate on a closed database');
}

function payloadScope(payload) {
  const record = payload || {};
  return {
    organizationId: record.organizationId || record.organization_id || null,
    projectId: record.projectId || record.project_id || null
  };
}

async function insertEventRow(db, event) {
  const scope = payloadScope(event.payload);
  await db.run(
    'INSERT OR IGNORE INTO telemetry_events (event_id, session_id, agent_id, event_type, action, detail, payload_json, severity, organization_id, project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    event.id, event.sessionId || 'session_live', event.agentId, event.eventType,
    event.action, event.detail, JSON.stringify(event.payload), event.severity,
    scope.organizationId, scope.projectId
  );
}

function provenanceRow(event) {
  const payloadJson = JSON.stringify({ eventId: event.id, eventType: event.eventType, agentId: event.agentId, action: event.action, detail: event.detail, payload: event.payload });
  const payloadHash = crypto.createHash('sha256').update(payloadJson).digest('hex');
  const scope = payloadScope(event.payload);
  return [`prov-event-${event.id}`, event.eventType.toLowerCase(), event.id, payloadHash, payloadJson, scope.organizationId, scope.projectId];
}

async function insertProvenanceRow(db, event) {
  if (!PROVENANCE_TYPES.has(event.eventType)) return;
  await db.run('INSERT OR IGNORE INTO provenance_records (id, subject_type, subject_id, payload_hash, payload_json, organization_id, project_id) VALUES (?, ?, ?, ?, ?, ?, ?)', ...provenanceRow(event));
}

async function persistOne(observer, db, event) {
  await insertEventRow(db, event);
  await insertProvenanceRow(db, event);
  await observer.persistWorkspaceMilestone(db, event);
  if (event.eventType === 'AGENT_COMPLETED') await observer.generateWorkspaceReadme(db, event.agentId);
}

async function persistHead(observer) {
  const queuedEvent = observer.persistQueue.shift();
  try {
    const db = await getDatabase();
    await persistOne(observer, db, queuedEvent);
    observer.persistedEvents += 1;
    if (observer.persistedEvents % 1000 === 0) await observer.pruneHistory(db);
    return false;
  } catch (error) {
    return handlePersistError(observer, queuedEvent, error);
  }
}

function handlePersistError(observer, queuedEvent, error) {
  observer.persistenceErrors += 1;
  console.error('[TelemetryObserver] Event persistence failed:', error.message);
  if (isDbClosedError(error) || /SQLITE_BUSY|locked/i.test(error.message)) {
    observer.persistQueue.unshift(queuedEvent);
    return true;
  }
  return false;
}

async function drain(observer) {
  let abort = false;
  while (observer.persistQueue.length && !abort) {
    abort = await persistHead(observer);
  }
  return abort;
}

module.exports = { drain, persistOne, isDbClosedError, PROVENANCE_TYPES };
