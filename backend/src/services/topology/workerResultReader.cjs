'use strict';

const { digest } = require('../biologicalIntegrity');
const store = require('../biologicalWorkerStore');

async function read(db, input) {
  const member = input.member;
  const agent = await db.get('SELECT status FROM agents WHERE id = ?', member.workerId);
  const evidence = await readEvidence(db, input);
  return resultFromEvidence({ member, agent, evidence });
}

async function readAll(db, input) {
  const members = input.members || [];
  await Promise.all(members.map(async (member) => {
    const generic = await read(db, { member, missionId: input.missionId,
      executionRunId: member.executionRunId });
    member.result = mergeSpecializedResult(generic, member.result);
  }));
  return members;
}

async function readEvidence(db, input) {
  if (!input.missionId || !input.member?.workerId) return invalidEvidence();
  try {
    await store.ensure(db);
    const bindingRow = await latestBinding(db, input);
    if (!bindingRow) return invalidEvidence();
    const binding = store.verifiedJson(bindingRow, 'binding_json');
    if (!bindingMatches(bindingRow, binding, input)) return invalidEvidence();
    return await evidenceForBinding(db, bindingRow, binding);
  } catch (_) {
    return invalidEvidence();
  }
}

async function latestBinding(db, input) {
  const executionRunId = input.executionRunId || input.member.executionRunId;
  if (executionRunId) {
    return db.get(`SELECT * FROM biological_worker_bindings
      WHERE mission_id = ? AND agent_id = ? AND run_id = ?`,
    input.missionId, input.member.workerId, executionRunId);
  }
  const rows = await db.all(`SELECT * FROM biological_worker_bindings
    WHERE mission_id = ? AND agent_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 2`,
  input.missionId, input.member.workerId);
  return rows.length === 1 ? rows[0] : null;
}

async function evidenceForBinding(db, bindingRow, binding) {
  const receiptRow = await db.get('SELECT * FROM biological_worker_receipts WHERE run_id = ?', bindingRow.run_id);
  if (!receiptRow) return invalidEvidence();
  const receipt = store.verifiedJson(receiptRow, 'receipt_json');
  if (!receiptMatches({ bindingRow, binding, receiptRow, receipt })) return invalidEvidence();
  const rows = await db.all('SELECT * FROM biological_worker_observations WHERE run_id = ? ORDER BY rowid', bindingRow.run_id);
  const observations = rows.map((row) => ({ row, event: store.verifiedJson(row, 'event_json') }));
  if (!observationsMatch(receipt, observations)) return invalidEvidence();
  return { valid: true, binding, receipt, event: reportObservation(receipt, observations) };
}

function bindingMatches(row, binding, input) {
  return binding?.runId === row.run_id && binding.missionId === input.missionId
    && binding.workerId === input.member.workerId
    && row.mission_id === input.missionId && row.agent_id === input.member.workerId;
}

function receiptMatches(input) {
  const { bindingRow, binding, receiptRow, receipt } = input;
  return receipt?.runId === bindingRow.run_id && receiptRow.run_id === bindingRow.run_id
    && receipt.receiptId === receiptRow.receipt_id
    && receipt.missionId === binding.missionId && receiptRow.mission_id === binding.missionId
    && receipt.workerId === binding.workerId && receipt.bindingHash === digest(binding)
    && receipt.evidence?.hash === digest({ report: receipt.evidence.report,
      proof: receipt.evidence.noAnswerProof });
}

function observationsMatch(receipt, observations) {
  const expected = receipt.evidence?.observations;
  if (!Array.isArray(expected) || expected.length === 0 || observations.length !== expected.length) return false;
  if (observations.some((item) => item.row.applied !== 1)) return false;
  if (observations.some((item) => eventRunMismatch(receipt.runId, item.event))) return false;
  return observations.every((item, index) => item.row.event_hash === expected[index])
    && Boolean(reportObservation(receipt, observations));
}

function eventRunMismatch(runId, event) {
  const observed = event?.payload?.executionRunId;
  return observed !== undefined && observed !== runId;
}

function reportObservation(receipt, observations) {
  const expected = digest(receipt.evidence?.report);
  return observations.findLast((item) => digest(reportFromEvent(item.event)) === expected) || null;
}

function reportFromEvent(event) {
  return event?.payload?.evidenceReport || event?.payload?.report || null;
}

function invalidEvidence() {
  return { valid: false, binding: null, receipt: null, event: null };
}

function resultFromEvidence(context) {
  const { member, agent, evidence } = context;
  const report = evidence.receipt?.evidence?.report || null;
  const answer = reportAnswer(report);
  const verified = isVerifiedEvidence(evidence, report, answer);
  return {
    workerId: member.workerId,
    role: member.role,
    status: resultStatus(agent, verified, evidence.valid),
    verified,
    answer: answer || null,
    evidenceEventId: evidenceEventId(evidence),
    outcome: report?.outcome || null
  };
}

function isVerifiedEvidence(evidence, report, answer) {
  return evidence.valid && evidence.receipt?.result?.status === 'completed'
    && evidence.receipt?.result?.verified === true && report?.outcome === 'success' && Boolean(answer);
}

function evidenceEventId(evidence) {
  return evidence.event?.event?.id || evidence.event?.event?.eventId
    || evidence.event?.row?.event_key || null;
}

function mergeSpecializedResult(generic, specialized) {
  const result = { ...(specialized || {}), ...generic };
  const rejected = specialized?.verified === false
    || specialized?.status && specialized.status !== 'completed';
  if (generic.verified && rejected) {
    result.status = specialized.verified === false ? 'unverified'
      : specialized.status || 'unverified';
    result.verified = false;
  }
  return result;
}

function resultStatus(agent, verified, validEvidence) {
  if (verified) return 'completed';
  if (!validEvidence || agent?.status === 'completed') return 'unverified';
  return agent?.status || 'missing';
}

function reportAnswer(report) {
  const content = report?.workerArtifact?.content || {};
  const claims = Array.isArray(report?.claims) ? report.claims
    : Array.isArray(content.claims) ? content.claims : [];
  const statements = claims.map((claim) => text(claim?.statement)).filter(Boolean);
  return [text(report?.answer), text(content.answer), ...statements].filter(Boolean).join('\n').trim();
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

module.exports = { read, readAll, readEvidence };
