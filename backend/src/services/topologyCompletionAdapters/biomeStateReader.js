'use strict';

const { digest } = require('../evidenceContractService');

function result(status, reason, extra = {}) {
  return { status, ...(reason ? { reason } : {}), ...extra };
}

function sessionId(context = {}) {
  return context.sessionId || context.output?.sessionId || null;
}

function memberIds(evidence = {}) {
  return [...new Set((evidence.members || [])
    .map((member) => member.memberId || member.workerId).filter(Boolean))];
}

function parseObject(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (_) { return null; }
}

function identityIssue(state, id) {
  const ecology = state?.ecology;
  if (state?.biomeId !== id || ecology?.biomeId !== id || ecology?.missionId !== id) {
    return result('failed', 'biome_session_identity_mismatch');
  }
  return null;
}

function metadataIssue(row, id) {
  const metadata = parseObject(row.metadata_json);
  if (!metadata) return result('failed', 'biome_member_metadata_invalid');
  if (!metadata.topologySessionId) return result('partial', 'biome_member_session_binding_missing');
  if (metadata.topologySessionId !== id) {
    return result('failed', 'biome_member_session_binding_mismatch');
  }
  return null;
}

function bindingIssue(rows, scope) {
  for (const workerId of scope.workerIds) {
    const owned = rows.filter((row) => row.agent_id === workerId);
    if (!owned.length) return result('partial', 'biome_member_mission_binding_missing');
    const bound = owned.find((row) => row.mission_id === scope.missionId);
    if (!bound) return result('failed', 'biome_mission_scope_mismatch');
    const issue = metadataIssue(bound, scope.sessionId);
    if (issue) return issue;
  }
  return null;
}

async function missionBindings(db, scope) {
  if (!scope.workerIds.length) return result('partial', 'biome_member_scope_missing');
  const marks = scope.workerIds.map(() => '?').join(', ');
  const rows = await db.all(`SELECT ma.mission_id, ma.agent_id, a.metadata_json
    FROM mission_agents ma JOIN agents a ON a.id = ma.agent_id
    WHERE ma.agent_id IN (${marks})`, ...scope.workerIds);
  const issue = bindingIssue(rows, scope);
  return issue || result('verified', null, { bindings: rows.filter((row) =>
    row.mission_id === scope.missionId) });
}

function eventIssue(rows, revision) {
  if (!revision || !rows.length) return result('partial', 'biome_ecological_phase_missing');
  if (rows.length !== revision) return result('failed', 'biome_event_journal_gap');
  for (const [index, row] of rows.entries()) {
    const payload = parseObject(row.payload_json);
    if (Number(row.revision) !== index + 1 || !payload) {
      return result('failed', 'biome_event_journal_integrity_failed');
    }
    if (payload.resultingRevision !== Number(row.revision)
        || payload.previousRevision !== Number(row.revision) - 1) {
      return result('failed', 'biome_event_journal_integrity_failed');
    }
  }
  return null;
}

async function eventJournal(db, id, revision) {
  const rows = await db.all(`SELECT revision, event_type, payload_json
    FROM topology_session_events WHERE session_id = ? AND topology = 'biome'
    ORDER BY revision`, id);
  const issue = eventIssue(rows, revision);
  return issue || result('verified', null, { events: rows.map((row) => ({
    revision: Number(row.revision), type: row.event_type,
    payload: parseObject(row.payload_json)
  })) });
}

async function loadSession(db, id) {
  const row = await db.get(`SELECT topology, state_json, revision
    FROM topology_sessions WHERE id = ?`, id);
  if (!row) return result('partial', 'biome_session_missing');
  if (row.topology !== 'biome') return result('failed', 'biome_topology_scope_mismatch');
  const state = parseObject(row.state_json);
  if (!state) return result('failed', 'biome_session_state_invalid');
  const identity = identityIssue(state, id);
  return identity || result('loaded', null, {
    state, revision: Number(row.revision) || 0
  });
}

function snapshotSeal(input) {
  return { sessionId: input.sessionId, revision: input.revision,
    stateHash: digest(input.state), eventJournalHash: digest(input.events) };
}

async function revalidate(input = {}) {
  const seal = input.seal;
  if (!input.db || !seal?.sessionId) {
    return result('failed', 'biome_completion_snapshot_seal_missing');
  }
  const loaded = await loadSession(input.db, seal.sessionId);
  if (loaded.status !== 'loaded') {
    return result('failed', loaded.reason || 'biome_completion_snapshot_changed');
  }
  if (loaded.revision !== seal.revision || digest(loaded.state) !== seal.stateHash) {
    return result('failed', 'biome_completion_snapshot_changed');
  }
  const journal = await eventJournal(input.db, seal.sessionId, loaded.revision);
  if (journal.status !== 'verified'
      || digest(journal.events) !== seal.eventJournalHash) {
    return result('failed', 'biome_completion_snapshot_changed');
  }
  return result('verified');
}

async function read(input = {}) {
  const id = sessionId(input.context);
  const workerIds = memberIds(input.evidence);
  if (!input.db || !input.missionId || !id) {
    return result('partial', 'biome_completion_scope_missing');
  }
  const loaded = await loadSession(input.db, id);
  if (loaded.status !== 'loaded') return loaded;
  const bindings = await missionBindings(input.db, {
    missionId: input.missionId, sessionId: id, workerIds
  });
  if (bindings.status !== 'verified') return bindings;
  const journal = await eventJournal(input.db, id, loaded.revision);
  if (journal.status !== 'verified') return journal;
  const seal = snapshotSeal({ sessionId: id, revision: loaded.revision,
    state: loaded.state, events: journal.events });
  return result('read', null, { sessionId: id, revision: loaded.revision,
    state: loaded.state, events: journal.events, bindings: bindings.bindings, seal });
}

module.exports = { read, revalidate };
