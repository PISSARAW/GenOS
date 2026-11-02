'use strict';

const { digest } = require('../evidenceProtocol/canonical');
const ledger = require('../metabolicLedgerService');
const { METRICS } = require('../metabolicLedgerContract');
const { migrateMetabolicLedger } = require('../../db/migrations/migrateMetabolicLedger');

async function initialize(db) {
  await migrateMetabolicLedger(db);
  await db.exec(`CREATE TABLE IF NOT EXISTS allostasis_native_usage_attribution (
    observation_id TEXT NOT NULL, metric TEXT NOT NULL, allocation_key TEXT NOT NULL, operation_id TEXT NOT NULL,
    receipt_id TEXT,
    PRIMARY KEY(observation_id,metric)
  );`);
  const columns = await db.all('PRAGMA table_info(allostasis_native_usage_attribution)');
  if (!columns.some(column => column.name === 'receipt_id')) await db.exec('ALTER TABLE allostasis_native_usage_attribution ADD COLUMN receipt_id TEXT');
}

async function attribute(db, input, selected) {
  const { proof, query, operationId, receiptId } = input;
  const prior = await db.get('SELECT * FROM allostasis_native_usage_attribution WHERE observation_id=? AND metric=?',
    proof.nativeObservationId, selected.name);
  if (prior) {
    if (prior.allocation_key !== digest(query) || prior.operation_id !== operationId) throw new Error('ALLOSTASIS native usage observation already belongs to another allocation.');
    if (prior.receipt_id !== receiptId) throw new Error('ALLOSTASIS native usage observation already accounted by another receipt.');
    return;
  }
  await db.run('INSERT INTO allostasis_native_usage_attribution VALUES (?,?,?,?,?)',
    proof.nativeObservationId, selected.name, digest(query), operationId, receiptId);
}

function metric(unit, proof) {
  if (unit === 'tokens') return { name: 'billableTokens', scale: 1 };
  if (unit === 'micro_USD') return { name: 'runtimeCostUsd', scale: 1000000 };
  if (unit !== 'milliseconds') return null;
  if (!['activeTimeMs', 'wallTimeMs'].includes(proof.metricId)) throw new Error('ALLOSTASIS time usage needs an explicit native active/wall metric.');
  return { name: proof.metricId, scale: 1 };
}

async function existing(db, input, selected) {
  const { query, proof, delta, operationId } = input;
  if (!proof.nativeObservationId) return null;
  const row = await db.get(`SELECT o.mission_id,o.organization_id,o.project_id,o.operation_id,
    m.value,m.source,m.evidence_ref FROM metabolic_ledger_observations o
    JOIN metabolic_ledger_measurements m ON m.observation_id=o.observation_id
    WHERE o.observation_id=? AND m.metric=?`, proof.nativeObservationId, METRICS[selected.name][0]);
  const expected = [query.missionId, query.scope.organizationId, query.scope.projectId, operationId,
    proof.status === 'unknown' ? null : delta / selected.scale, proof.source];
  const actual = row && [row.mission_id, row.organization_id, row.project_id, row.operation_id, row.value, row.source];
  if (!row || digest(expected) !== digest(actual)) throw new Error('ALLOSTASIS existing native usage observation does not match this exact scoped delta.');
  if (proof.source === 'provider_receipt' && row.evidence_ref !== proof.evidenceRef) throw new Error('ALLOSTASIS existing native provider evidence differs.');
  await attribute(db, input, selected);
  return proof.nativeObservationId;
}

async function record(db, input) {
  const { query, allocation, proof, delta, receiptId, operationId } = input;
  const selected = metric(allocation.unit, proof);
  if (!selected) return null;
  const prior = await existing(db, input, selected);
  if (prior) return prior;
  let measurement = proof.status === 'unknown'
    ? { source: 'unavailable', unavailableReason: 'Operation outcome remains unknown; exposure is retained.' }
    : { source: proof.source, value: delta / selected.scale, evidenceRef: proof.evidenceRef };
  if (allocation.unit === 'micro_USD' && Math.round((delta / selected.scale) * selected.scale) !== delta) {
    measurement = { source: 'unavailable', unavailableReason: 'Native USD conversion loses precision; exact micro-units remain in ALLOSTASIS.' };
  }
  const id = `allostasis:${digest([query, receiptId])}`;
  await ledger.recordMetabolicObservation(db, { id, missionId: query.missionId,
    organizationId: query.scope.organizationId, projectId: query.scope.projectId,
    operationId, measurements: { [selected.name]: measurement },
    metadata: { protocol: 'genos.allostasis/v1', allocationId: query.allocationId,
      allocationDigest: query.allocationDigest, unit: allocation.unit, cumulativeAmount: proof.cumulativeAmount,
      sourceReceiptDigest: proof.receiptDigest, final: proof.final } });
  return id;
}

module.exports = { initialize, record };
