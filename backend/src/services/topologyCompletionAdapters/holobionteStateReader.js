'use strict';

const { initializeHolobiontSchema } = require('../holobionte/runtime/holobiontSchema');

function result(status, reason, extra = {}) {
  return { status, ...(reason ? { reason } : {}), ...extra };
}

function requestedId(context = {}) {
  return context.holobiontId || context.output?.holobiontId
    || context.output?.result?.holobiontId || null;
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch (_) { return null; }
}

function parseObject(value) {
  const parsed = parseJson(value);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
}

async function locateRow(db, missionId, context) {
  const explicitId = requestedId(context);
  if (explicitId) {
    const row = await db.get('SELECT * FROM holobiont_sessions WHERE holobiont_id = ?', explicitId);
    return row ? { row } : result('partial', 'holobionte_session_missing');
  }
  const rows = await db.all(`SELECT * FROM holobiont_sessions
    WHERE mission_id = ? ORDER BY created_at, holobiont_id`, missionId);
  if (!rows.length) return result('partial', 'holobionte_session_missing');
  if (rows.length !== 1) return result('partial', 'holobionte_session_ambiguous');
  return { row: rows[0] };
}

function sessionIssue(row, session, missionId) {
  if (!session) return result('failed', 'holobionte_session_state_invalid');
  const coherent = session.holobiontId === row.holobiont_id
    && session.hostId === row.host_id && session.status === row.status
    && Number(session.revision) === Number(row.revision);
  if (!coherent) return result('failed', 'holobionte_session_state_mismatch');
  if (row.mission_id !== missionId || session.missionId !== missionId) {
    return result('failed', 'holobionte_mission_scope_mismatch');
  }
  if (row.scope !== 'MISSION' || session.scope !== 'MISSION') {
    return result('failed', 'holobionte_session_scope_mismatch');
  }
  return null;
}

function parseRows(rows, field) {
  const parsed = rows.map((row) => ({ ...row, payload: parseObject(row[field]) }));
  return parsed.some((row) => !row.payload) ? null : parsed;
}

async function journal(db, id, revision) {
  const eventRows = await db.all(`SELECT revision, event_type AS eventType,
    payload_json AS payloadJson, actor_id AS actorId FROM holobiont_events
    WHERE holobiont_id = ? ORDER BY revision`, id);
  const lifecycleRows = await db.all(`SELECT revision, event_type AS eventType,
    payload_json AS payloadJson FROM holobiont_lifecycle_events
    WHERE holobiont_id = ? ORDER BY revision`, id);
  const events = parseRows(eventRows, 'payloadJson');
  const lifecycle = parseRows(lifecycleRows, 'payloadJson');
  if (!events || !lifecycle) return result('failed', 'holobionte_event_journal_invalid');
  const revisions = [...events, ...lifecycle]
    .map((entry) => Number(entry.revision)).sort((left, right) => left - right);
  const contiguous = revisions.length === revision
    && revisions.every((value, index) => value === index + 1);
  return contiguous ? result('verified', null, { events, lifecycle })
    : result('failed', 'holobionte_event_journal_gap');
}

function parseLedgerRow(row) {
  const evidenceRefs = parseJson(row.evidence_refs_json);
  const immuneReview = parseObject(row.immune_review_json);
  if (!Array.isArray(evidenceRefs) || !immuneReview) return null;
  return { ledgerId: row.ledger_id, receiptId: row.receipt_id,
    contractId: row.contract_id, contractRevision: Number(row.contract_revision),
    symbiontId: row.symbiont_id, capability: row.capability,
    contributionScore: row.contribution_score, evidenceRefs,
    verifierId: row.verifier_id, resultHash: row.result_hash, immuneReview };
}

async function ledger(db, id) {
  const rows = await db.all(`SELECT * FROM holobiont_symbiosis_ledger
    WHERE holobiont_id = ? ORDER BY created_at, ledger_id`, id);
  const entries = rows.map(parseLedgerRow);
  return entries.some((entry) => !entry)
    ? result('failed', 'holobionte_contribution_ledger_invalid')
    : result('verified', null, { ledger: entries });
}

async function supportingState(db, id) {
  const contracts = await db.all(`SELECT contract_id AS contractId, revision,
    symbiont_id AS symbiontId, status, contract_json AS contractJson
    FROM holobiont_symbiosis_contracts WHERE holobiont_id = ?
    ORDER BY contract_id, revision`, id);
  const memories = await db.all(`SELECT memory_id AS memoryId, revision,
    source_holobiont_id AS sourceHolobiontId, mission_id AS missionId,
    memory_type AS memoryType, status, content_json AS contentJson,
    evidence_refs_json AS evidenceRefsJson, immune_review_json AS immuneReviewJson,
    author_id AS authorId FROM holobiont_memories
    WHERE source_holobiont_id = ? ORDER BY memory_id, revision`, id);
  const parsedContracts = contracts.map((row) => ({ ...row, contract: parseObject(row.contractJson) }));
  const parsedMemories = memories.map((row) => ({ ...row, content: parseObject(row.contentJson),
    evidenceRefs: parseJson(row.evidenceRefsJson), immuneReview: parseObject(row.immuneReviewJson) }));
  const invalid = parsedContracts.some((row) => !row.contract)
    || parsedMemories.some((row) => !row.content || !Array.isArray(row.evidenceRefs) || !row.immuneReview);
  return invalid ? result('failed', 'holobionte_supporting_state_invalid')
    : result('verified', null, { contracts: parsedContracts, memories: parsedMemories });
}

async function read(input = {}) {
  const { db, missionId, context = {} } = input;
  if (!db || !missionId) return result('partial', 'holobionte_completion_scope_missing');
  await initializeHolobiontSchema(db);
  const located = await locateRow(db, missionId, context);
  if (!located.row) return located;
  const session = parseObject(located.row.session_json);
  const invalidSession = sessionIssue(located.row, session, missionId);
  if (invalidSession) return { ...invalidSession, session };
  const journalState = await journal(db, session.holobiontId, Number(session.revision));
  if (journalState.status !== 'verified') return { ...journalState, session };
  const ledgerState = await ledger(db, session.holobiontId);
  if (ledgerState.status !== 'verified') return { ...ledgerState, session };
  const support = await supportingState(db, session.holobiontId);
  if (support.status !== 'verified') return { ...support, session };
  return result('read', null, { session, events: journalState.events,
    lifecycle: journalState.lifecycle, ledger: ledgerState.ledger,
    contracts: support.contracts, memories: support.memories });
}

module.exports = { read, requestedId };
