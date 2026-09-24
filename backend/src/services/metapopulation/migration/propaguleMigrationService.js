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
  if (!isValidReceiverDecision(validation)) {
    return migrationStore.resolveMigration(input.db, input.metapopulationId, {
      migrationId: migration.migrationId, status: 'REJECTED', validation: validation?.evidence || {},
      reason: validation?.reason || 'Receiver validation rejected the propagule.'
    });
  }
  const receipt = await adapter.assimilate({ ...context, validation });
  if (typeof receipt?.receiptId !== 'string' || !receipt.receiptId.trim() || !receipt?.provenance || typeof receipt.provenance !== 'object' || Array.isArray(receipt.provenance)) {
    throw Object.assign(new Error('Assimilation must return a provenance-bearing receipt.'), { code: 'METAPOPULATION_ASSIMILATION_RECEIPT_REQUIRED' });
  }
  return migrationStore.resolveMigration(input.db, input.metapopulationId, {
    migrationId: migration.migrationId, status: 'ACCEPTED', validation: validation.evidence, receipt
  });
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
