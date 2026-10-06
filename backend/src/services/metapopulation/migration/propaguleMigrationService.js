'use strict';
const migrationStore = require('./migrationStore');
const adapterRegistry = require('./migrationAdapterRegistry');

async function offerPropagule(input, options = {}) {
  requireDatabase(options);
  if (!input?.metapopulationId || !input?.corridorId) throw contextError();
  return migrationStore.offerMigration(options.db, input);
}

async function listPropaguleQuarantine(input, options = {}) {
  requireDatabase(options);
  if (!input?.metapopulationId || !input?.targetDemeId) throw contextError();
  return migrationStore.listQuarantine(options.db, input.metapopulationId, input.targetDemeId);
}

async function reviewPropagule(input, options = {}) {
  requireDatabase(options);
  if (!input?.metapopulationId || !input?.migrationId || !input?.receiverDemeId || !isRecord(input.receiver)) throw contextError();
  const migration = await migrationStore.getMigration(options.db, input.metapopulationId, input.migrationId);
  if (!migration) throw Object.assign(new Error('Unknown migration.'), { code: 'METAPOPULATION_MIGRATION_UNKNOWN' });
  if (migration.targetDemeId !== input.receiverDemeId) throw Object.assign(new Error('Only the target deme may review a propagule.'), { code: 'METAPOPULATION_RECEIVER_MISMATCH' });
  if (migration.status !== 'QUARANTINED') throw Object.assign(new Error('Migration is no longer quarantined.'), { code: 'METAPOPULATION_MIGRATION_ALREADY_RESOLVED' });
  return validateAndAssimilate(migration, { ...input, db: options.db });
}

async function rollbackRescue(input, options = {}) {
  requireDatabase(options);
  if (input?.outcome?.rollback !== true) throw Object.assign(new Error('Rollback requires a verified regression outcome.'), { code: 'METAPOPULATION_RESCUE_ROLLBACK_INVALID' });
  const migration = await migrationStore.getMigration(options.db, input.metapopulationId, input.migrationId);
  if (!migration || migration.status !== 'ACCEPTED' || migration.evidence.migrationReason?.toLowerCase() !== 'rescue') {
    throw Object.assign(new Error('An accepted rescue migration is required.'), { code: 'METAPOPULATION_RESCUE_NOT_REVERSIBLE' });
  }
  const adapter = adapterRegistry.resolveAdapter(migration.type);
  if (!adapter?.rollback) throw Object.assign(new Error('The receiver adapter does not support rollback.'), { code: 'METAPOPULATION_RESCUE_ROLLBACK_UNAVAILABLE' });
  const receipt = await adapter.rollback({ migration, receiver: input.receiver, idempotencyKey: `rollback:${migration.migrationId}` });
  if (!hasProvenanceReceipt(receipt) || !isPenaltyValid(input.corridorPenalty)) {
    throw Object.assign(new Error('A provenance receipt and bounded corridor penalty are required.'), { code: 'METAPOPULATION_RESCUE_ROLLBACK_INVALID' });
  }
  return migrationStore.rollbackAcceptedMigration(options.db, input.metapopulationId, {
    migrationId: migration.migrationId, receipt, reason: input.reason || 'RECEIVER_REGRESSION', penalty: input.corridorPenalty
  });
}

function hasProvenanceReceipt(receipt) {
  return typeof receipt?.receiptId === 'string' && Boolean(receipt.receiptId.trim()) &&
    Boolean(receipt.provenance) && typeof receipt.provenance === 'object' && !Array.isArray(receipt.provenance);
}

function isPenaltyValid(penalty) {
  return Number.isFinite(penalty) && penalty >= 0 && penalty <= 1;
}

async function validateAndAssimilate(migration, input) {
  const adapter = adapterRegistry.resolveAdapter(migration.type);
  if (!adapter) throw Object.assign(new Error(`No migration adapter is registered for ${migration.type}.`), { code: 'METAPOPULATION_ADAPTER_UNAVAILABLE' });
  const context = { migration, receiver: input.receiver, idempotencyKey: migration.migrationId };
  const validation = await adapter.validate(context);
  if (validation?.decision === 'REQUEST_MORE_EVIDENCE') return deferMigration(migration, input, validation);
  if (!isValidReceiverDecision(validation) || validation.decision === 'REJECT') {
    return migrationStore.resolveMigration(input.db, input.metapopulationId, {
      migrationId: migration.migrationId, status: 'REJECTED', validation: validation?.evidence || {},
      reason: validation?.reason || 'Receiver validation rejected the propagule.'
    });
  }
  const adaptation = await adaptIfRequested(adapter, context, validation);
  const receipt = await adapter.assimilate({ ...context, validation, adaptation });
  if (!hasProvenanceReceipt(receipt)) {
    throw Object.assign(new Error('Assimilation must return a provenance-bearing receipt.'), { code: 'METAPOPULATION_ASSIMILATION_RECEIPT_REQUIRED' });
  }
  return migrationStore.resolveMigration(input.db, input.metapopulationId, {
    migrationId: migration.migrationId, status: 'ACCEPTED', validation: { ...validation.evidence, adaptation }, receipt
  });
}

async function adaptIfRequested(adapter, context, validation) {
  if (validation.decision !== 'ADAPT_AND_ACCEPT') return null;
  if (typeof adapter.adapt !== 'function') throw Object.assign(new Error('Receiver adaptation is unavailable.'),
    { code: 'METAPOPULATION_ADAPTATION_UNAVAILABLE' });
  const adaptation = await adapter.adapt({ ...context, validation });
  if (!hasProvenanceReceipt(adaptation)) throw Object.assign(new Error('Adaptation requires a provenance receipt.'),
    { code: 'METAPOPULATION_ADAPTATION_RECEIPT_REQUIRED' });
  const recheck = await adapter.validate({ ...context, adaptation });
  if (!isValidReceiverDecision(recheck) || recheck.decision === 'REJECT') throw Object.assign(new Error('Adapted payload failed local validation.'),
    { code: 'METAPOPULATION_ADAPTATION_INVALID' });
  return adaptation;
}

async function deferMigration(migration, input, validation) {
  if (!isRecord(validation.evidence)) throw Object.assign(new Error('An evidence request needs local provenance.'),
    { code: 'METAPOPULATION_RECEIVER_EVIDENCE_REQUIRED' });
  const { withTransaction } = require('../../../db');
  const store = require('../metapopulationStore');
  await withTransaction(input.db, async () => {
    await input.db.run('UPDATE metapopulation_migrations SET evidence_json = ? WHERE metapopulation_id = ? AND migration_id = ? AND status = ?',
      JSON.stringify({ ...migration.evidence, receiverEvidenceRequest: validation }), input.metapopulationId,
      migration.migrationId, 'QUARANTINED');
    await store.appendEvent(input.db, input.metapopulationId, { type: 'MIGRATION_EVIDENCE_REQUESTED',
      payload: { migrationId: migration.migrationId, reason: validation.reason }, actor: migration.targetDemeId,
      provenance: validation.evidence, occurredAt: new Date().toISOString() });
  });
  return migrationStore.getMigration(input.db, input.metapopulationId, migration.migrationId);
}

function isValidReceiverDecision(decision) {
  return decision?.valid === true && decision.evidence && typeof decision.evidence === 'object' && !Array.isArray(decision.evidence);
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function requireDatabase(options) {
  if (!options.db) throw Object.assign(new Error('A database is required.'), { code: 'METAPOPULATION_DB_REQUIRED' });
}

function contextError() { return Object.assign(new Error('Metapopulation and migration context are required.'), { code: 'METAPOPULATION_CONTEXT_REQUIRED' }); }

module.exports = { offerPropagule, listPropaguleQuarantine, reviewPropagule, rollbackRescue };
