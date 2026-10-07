'use strict';

const { randomUUID } = require('node:crypto');
const { withTransaction } = require('../../db');
const values = require('../trinityProvenanceValues');
const ledger = require('../gvxDevelopmentLedger');
const authority = require('../missionEnvelopeAuthority');
const subjects = require('./nativeOracleDomains');

function id(runId, kind) { return `gvx-run:${runId}:native-oracle-${kind}`; }

async function read(db, input) {
  const event = await ledger.getEvent(db, id(input.runId, input.kind), input.scope);
  if (!event) return null;
  if (event.payload.kind !== `native_oracle_${input.kind}`) throw values.failure('ORACLE_JOURNAL_INVALID');
  return { value: event.payload.record, hash: values.digest(event.payload.record), eventId: event.id };
}

async function append(db, input) {
  const event = await ledger.appendEvent(db, { id: id(input.record.runId, input.kind), ...input.scope,
    type: 'evidence_attached', payload: { kind: `native_oracle_${input.kind}`, record: values.canonical(input.record) } });
  return { value: event.payload.record, hash: values.digest(event.payload.record), eventId: event.id };
}

async function reserve(db, request) {
  return withTransaction(db, async () => {
    const current = await authority.assertRun(db, request);
    if (current.status === 'legacy_unbound') throw values.failure('ORACLE_AUTHORITY_REQUIRED');
    const scope = current.envelope.scope;
    const previous = await read(db, { runId: request.runId, kind: 'reservation', scope });
    if (previous) return { ...previous, owned: false };
    const limits = current.envelope.limits.verification;
    if (limits?.executions !== 2 || !Number.isSafeInteger(limits.latencyMs) || limits.latencyMs < 1) {
      throw values.failure('ORACLE_BUDGET_UNAVAILABLE');
    }
    const subject = await subjects.load(db, { ...request, scope });
    const expiresAt = new Date(Math.min(Date.now() + limits.latencyMs,
      Date.parse(current.envelope.expiresAt), Date.parse(subject.validUntil))).toISOString();
    if (Date.parse(expiresAt) <= Date.now()) throw values.failure('ORACLE_BUDGET_EXPIRED');
    const report = await observationReport(db, request.runId);
    const record = { schema: 'genos.native-oracle-reservation/v1', ...request, scope,
      executionAccounting: 'genos.native-oracle-execution/v1',
      domain: subject.domain,
      nonce: randomUUID(), limits, expiresAt, authorityHash: current.hash,
      subjectHash: values.digest(subject), observationHash: subject.observationHash,
      reportHash: values.digest(report), createdAt: new Date().toISOString() };
    const saved = await append(db, { kind: 'reservation', scope, record });
    return { ...saved, owned: true, subject };
  });
}

async function observationReport(db, runId) {
  const records = await require('../biologicalWorkerStore').observations(db, runId);
  return records.filter(item => item.applied && item.event.eventType === 'EVIDENCE_REPORT').at(-1)?.event.payload.evidenceReport;
}

module.exports = { id, read, append, reserve, observationReport };
