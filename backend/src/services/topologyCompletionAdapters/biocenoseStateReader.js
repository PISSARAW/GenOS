'use strict';

const communityStore = require('../biocenose/communityStore');
const roundJournal = require('../biocenose/runtime/roundJournal');
const dissentStore = require('../biocenose/dissent/dissentStore');
const { assertValidConstitution } = require('../biocenose/governance/constitutionValidator');
const { constitutionHash } = require('../biocenose/governance/protocolVersioning');
const { digest } = require('../evidenceContractService');

function requestedCommunity(context = {}) {
  return context.communityId || context.sessionId
    || context.output?.communityId || context.output?.sessionId || null;
}

async function missionCommunity(db, missionId) {
  const rows = await db.all(
    'SELECT community_id FROM biocenose_communities WHERE mission_id = ? ORDER BY created_at, community_id',
    missionId
  );
  if (!rows.length) return { status: 'partial', reason: 'biocenose_community_missing' };
  if (rows.length !== 1) return { status: 'partial', reason: 'biocenose_community_ambiguous' };
  return { communityId: rows[0].community_id };
}

async function locate(input) {
  const { db, missionId, context = {} } = input;
  if (!db || !missionId) return { status: 'partial', reason: 'biocenose_scope_missing' };
  await communityStore.ensureSchema(db);
  const explicitId = requestedCommunity(context);
  const located = explicitId ? { communityId: explicitId } : await missionCommunity(db, missionId);
  if (!located.communityId) return located;
  const session = await communityStore.loadSession(db, located.communityId);
  if (!session) return { status: 'partial', reason: 'biocenose_community_missing' };
  if (session.missionId !== missionId) return { status: 'failed',
    reason: 'biocenose_mission_scope_mismatch', communityId: session.communityId };
  return { status: 'located', session };
}

function assertConstitution(record, session) {
  if (!record) return { status: 'partial', reason: 'biocenose_constitution_missing' };
  try { assertValidConstitution(record); }
  catch (_) { return { status: 'failed', reason: 'biocenose_constitution_invalid' }; }
  const valid = record.communityId === session.communityId
    && record.constitutionId === session.constitutionId
    && constitutionHash(record.constitution) === record.constitutionHash;
  return valid ? null : { status: 'failed', reason: 'biocenose_constitution_integrity_failed' };
}

function assertEventFrontier(events, session) {
  const contiguous = events.every((event, index) => event.revision === index);
  const frontier = events.at(-1)?.revision;
  if (contiguous && frontier === session.revision) return null;
  return { status: 'failed', reason: 'biocenose_event_journal_integrity_failed' };
}

function parseJudgment(row) {
  try { return JSON.parse(row.judgment_json); }
  catch (_) { return null; }
}

async function judgmentState(db, session) {
  if (!session.judgmentId) return { status: 'partial', reason: 'biocenose_judgment_missing' };
  const row = await db.get(`SELECT judgment_id, community_id, round, judgment_json
    FROM biocenose_judgments WHERE judgment_id = ?`, session.judgmentId);
  const judgment = row && parseJudgment(row);
  if (!row || !judgment) return { status: 'failed', reason: 'biocenose_judgment_integrity_failed' };
  const bound = row.community_id === session.communityId && Number(row.round) === session.round;
  return bound ? { row, judgment }
    : { status: 'failed', reason: 'biocenose_judgment_scope_mismatch' };
}

function finalStep(receipts) {
  return receipts.find((item) => item.step === 'record_community_judgment')?.result;
}

function assertFinalJudgment(state) {
  const final = finalStep(state.receipts);
  if (!final) return { status: 'partial', reason: 'biocenose_judgment_step_missing' };
  if (final.judgmentId !== state.judgment.row.judgment_id
      || digest(final.judgment) !== digest(state.judgment.judgment)) {
    return { status: 'failed', reason: 'biocenose_judgment_integrity_failed' };
  }
  if (state.session.status !== 'DECIDED' || state.session.phase !== 'DECIDED'
      || state.judgment.judgment.status !== 'DECIDED') {
    return { status: 'partial', reason: 'biocenose_judgment_not_terminal' };
  }
  return null;
}

async function read(input) {
  const located = await locate(input);
  if (!located.session) return located;
  const { session } = located;
  const constitution = await communityStore.latestConstitution(input.db, session.communityId);
  const constitutionIssue = assertConstitution(constitution, session);
  if (constitutionIssue) return { ...constitutionIssue, session };
  const events = await communityStore.listEvents(input.db, session.communityId);
  const frontierIssue = assertEventFrontier(events, session);
  if (frontierIssue) return { ...frontierIssue, session };
  let receipts;
  try { receipts = await roundJournal.load({ db: input.db, communityId: session.communityId,
    round: session.round, constitutionHash: constitution.constitutionHash }); }
  catch (_) { return { status: 'failed', reason: 'biocenose_round_journal_integrity_failed', session }; }
  const judgment = await judgmentState(input.db, session);
  if (!judgment.judgment) return { ...judgment, session };
  const claims = await communityStore.listClaims(input.db, session.communityId, session.round);
  const dissent = await dissentStore.list(input.db, session.communityId);
  const state = { status: 'read', session, constitution, events, receipts, judgment, claims, dissent };
  return assertFinalJudgment(state) || state;
}

module.exports = { read };
