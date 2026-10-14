const crypto = require('crypto');

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const body = Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
  return `{${body.join(',')}}`;
}

function parsePayload(text) {
  try { return JSON.parse(text); } catch (_) { return {}; }
}

function sourceEventHash(row) {
  const material = {
    id: row.id, event_id: row.event_id, session_id: row.session_id,
    agent_id: row.agent_id, event_type: row.event_type, action: row.action,
    detail: row.detail, payload: parsePayload(row.payload_json), severity: row.severity,
    organization_id: row.organization_id, project_id: row.project_id, created_at: row.created_at
  };
  return crypto.createHash('sha256').update(stableStringify(material)).digest('hex');
}

async function loadSourceEvent(db, eventId) {
  return db.get(
    `SELECT id, event_id, session_id, agent_id, event_type, action, detail, payload_json,
            severity, organization_id, project_id, created_at
       FROM telemetry_events WHERE event_id = ?`,
    eventId
  );
}

function isMatchingLineage(event, record) {
  return event.agent_id === record.extinct_lineage_id
    && (event.organization_id || null) === record.organization_id
    && (event.project_id || null) === record.project_id;
}

async function bindSourceEvent(db, record, computePayloadHash) {
  if (!record.source_event_id) return;
  const event = await loadSourceEvent(db, record.source_event_id);
  if (!event) throw new Error('Source event not found for fossil provenance');
  if (!isMatchingLineage(event, record)) throw new Error('Source event lineage or scope does not match fossil');
  if (!['AGENT_FAILED', 'AGENT_COMPLETED', 'AGENT_TERMINATED'].includes(event.event_type)) {
    throw new Error('Source event must be a terminal lineage event');
  }
  record.source_event_hash = sourceEventHash(event);
  record.payload_hash = computePayloadHash(record);
}

async function verifySourceEvent(db, record) {
  if (!record.source_event_id) return true;
  const event = await loadSourceEvent(db, record.source_event_id);
  return Boolean(event && isMatchingLineage(event, record)
    && ['AGENT_FAILED', 'AGENT_COMPLETED', 'AGENT_TERMINATED'].includes(event.event_type)
    && sourceEventHash(event) === record.source_event_hash);
}

module.exports = { stableStringify, sourceEventHash, bindSourceEvent, verifySourceEvent };
