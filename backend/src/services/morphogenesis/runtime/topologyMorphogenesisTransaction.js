'use strict';

const { fingerprint } = require('../../stateFingerprint');

const REQUIRED_CAPABILITIES = Object.freeze([
  'observe', 'quiesce', 'snapshot', 'adapt', 'restore', 'finalize'
]);

async function executeTopologyMorphogenesis(input = {}) {
  validateInput(input);
  assertQualified(input.port);
  const transaction = createTransaction(input);
  try {
    await executePhases(transaction, input);
    return committedReceipt(transaction);
  } catch (error) {
    return failureReceipt(transaction, input, error);
  }
}

function validateInput(input) {
  if (!input.port || typeof input.port.morphogenesis !== 'function'
    || typeof input.port.qualified !== 'function') {
    throw coded('TOPOLOGY_MORPHOGENESIS_PORT_REQUIRED',
      'A topology runtime port with a lifecycle is required.');
  }
  if (typeof input.transitionId !== 'string' || !input.transitionId.trim()) {
    throw coded('TOPOLOGY_MORPHOGENESIS_ID_REQUIRED', 'A transitionId is required.');
  }
  if (typeof input.verify !== 'function') {
    throw coded('TOPOLOGY_MORPHOGENESIS_VERIFIER_REQUIRED',
      'An independent transition verifier is required.');
  }
  if (!text(input.producerId) || !text(input.verifierId)
    || input.producerId === input.verifierId) {
    throw coded('TOPOLOGY_MORPHOGENESIS_VERIFIER_NOT_INDEPENDENT',
      'Distinct producer and verifier identities are required.');
  }
}

function assertQualified(port) {
  const missing = REQUIRED_CAPABILITIES.filter((capability) => !port.qualified(capability));
  if (missing.length) {
    throw coded('TOPOLOGY_MORPHOGENESIS_LIFECYCLE_UNQUALIFIED',
      `Verified lifecycle unavailable: ${missing.join(', ')}.`);
  }
}

function createTransaction(input) {
  return {
    transitionId: input.transitionId,
    topology: input.port.topology,
    status: 'preparing',
    phases: [],
    snapshot: null,
    quiesced: false,
    recoveryArmed: false,
    restoreAttempt: 0,
    adaptation: null,
    verification: null,
    recoveryVerification: null,
    finalization: null
  };
}

async function executePhases(transaction, input) {
  await phase(transaction, input, 'observe');
  const quiescence = await phase(transaction, input, 'quiesce');
  assertReceipt(quiescence?.quiescent === true, 'TOPOLOGY_MORPHOGENESIS_NOT_QUIESCENT',
    'The topology did not prove quiescence.');
  transaction.quiesced = true;
  transaction.snapshot = await phase(transaction, input, 'snapshot');
  transaction.snapshot = sealSnapshot(transaction.snapshot, input);
  transaction.recoveryArmed = true;
  transaction.status = 'applying';
  transaction.adaptation = await phase(transaction, input, 'adapt');
  assertReceipt(transaction.adaptation?.applied === true,
    'TOPOLOGY_MORPHOGENESIS_ADAPTATION_UNCONFIRMED', 'The adaptation was not confirmed.');
  transaction.verification = await verifyState(transaction, input, 'adapted');
  transaction.finalization = await phase(transaction, input, 'finalize');
  assertReceipt(transaction.finalization?.finalized === true,
    'TOPOLOGY_MORPHOGENESIS_FINALIZATION_UNCONFIRMED', 'Finalization was not confirmed.');
  transaction.status = 'committed';
}

async function phase(transaction, input, capability) {
  const result = await input.port.morphogenesis(capability, {
    transitionId: transaction.transitionId,
    plan: input.plan || {},
    context: input.context || {},
    snapshot: transaction.snapshot ? structuredClone(transaction.snapshot) : null,
    adaptation: transaction.adaptation,
    verification: transaction.verification,
    restoreAttempt: transaction.restoreAttempt,
    producerId: input.producerId, verifierId: input.verifierId
  });
  transaction.phases.push({ capability, status: 'completed' });
  return result;
}

function verificationInput(transaction, input, stage) {
  return {
    transitionId: transaction.transitionId,
    topology: transaction.topology,
    plan: input.plan || {},
    snapshot: transaction.snapshot,
    adaptation: transaction.adaptation,
    restored: stage === 'restored',
    stage,
    producerId: input.producerId,
    verifierId: input.verifierId,
    context: input.context || {}
  };
}

function sealSnapshot(snapshot, input) {
  const valid = snapshot?.restorable === true
    && typeof snapshot.snapshotId === 'string' && snapshot.snapshotId
    && snapshot.producerId === input.producerId
    && Object.hasOwn(snapshot, 'state')
    && typeof snapshot.hash === 'string' && snapshot.hash === fingerprint(snapshot.state);
  assertReceipt(valid, 'TOPOLOGY_MORPHOGENESIS_SNAPSHOT_NOT_RESTORABLE',
    'The snapshot is not explicitly restorable and sealed.');
  return Object.freeze(structuredClone(snapshot));
}

function assertVerification(verification, input) {
  const refs = verification?.evidenceRefs;
  const valid = verification?.verified === true && Array.isArray(refs)
    && refs.some((reference) => typeof reference === 'string' && reference.trim())
    && verification.verifierId === input.verifierId;
  assertReceipt(valid, 'TOPOLOGY_MORPHOGENESIS_VERIFICATION_FAILED',
    'Independent verification with evidence references is required.');
}

function assertReceipt(condition, code, message) {
  if (!condition) throw coded(code, message);
}

async function failureReceipt(transaction, input, error) {
  if (!transaction.recoveryArmed) return blockedReceipt(transaction, input, error);
  let restored = null;
  let recoveryError = null;
  try {
    restored = await restoreIdempotently(transaction, input);
    transaction.recoveryVerification = await verifyState(transaction, input, 'restored');
  } catch (failure) {
    recoveryError = failure;
  }
  const finalizationError = await finalizeRecovery(transaction, input);
  transaction.status = recoveryError || finalizationError ? 'recovery_required' : 'restored';
  return receipt(transaction, error, { restored, restoreError: recoveryError, finalizationError });
}

function assertRestore(restored, snapshot) {
  assertReceipt(restored?.idempotent === true,
    'TOPOLOGY_MORPHOGENESIS_RESTORE_NON_IDEMPOTENT',
    'Restore did not prove idempotence.');
  const valid = restored?.restored === true && restored.snapshotId === snapshot.snapshotId
    && restored.hash === snapshot.hash;
  assertReceipt(valid, 'TOPOLOGY_MORPHOGENESIS_RESTORE_UNVERIFIED',
    'Restore receipt does not match the sealed snapshot.');
}

async function restoreIdempotently(transaction, input) {
  transaction.restoreAttempt = 1;
  const first = await phase(transaction, input, 'restore');
  assertRestore(first, transaction.snapshot);
  transaction.restoreAttempt = 2;
  const second = await phase(transaction, input, 'restore');
  assertRestore(second, transaction.snapshot);
  const stable = fingerprint(restoreBinding(first)) === fingerprint(restoreBinding(second));
  assertReceipt(stable, 'TOPOLOGY_MORPHOGENESIS_RESTORE_NON_IDEMPOTENT',
    'Repeated restore did not produce the same snapshot binding.');
  return second;
}

function restoreBinding(receiptValue) {
  return { restored: receiptValue.restored, idempotent: receiptValue.idempotent,
    snapshotId: receiptValue.snapshotId, hash: receiptValue.hash };
}

async function verifyState(transaction, input, stage) {
  const verification = await input.verify(verificationInput(transaction, input, stage));
  assertVerification(verification, input);
  transaction.phases.push({ capability: stage === 'restored' ? 'verify_restore' : 'verify',
    status: 'completed' });
  return verification;
}

async function finalizeRecovery(transaction, input) {
  try {
    transaction.finalization = await phase(transaction, input, 'finalize');
    assertReceipt(transaction.finalization?.finalized === true,
      'TOPOLOGY_MORPHOGENESIS_FINALIZATION_UNCONFIRMED', 'Finalization was not confirmed.');
    return null;
  } catch (error) { return error; }
}

function committedReceipt(transaction) {
  return {
    ...baseReceipt(transaction), committed: true,
    verification: transaction.verification,
    finalization: transaction.finalization,
    error: null,
    recovery: null
  };
}

async function blockedReceipt(transaction, input, error) {
  const finalizationError = transaction.quiesced ? await finalizeRecovery(transaction, input) : null;
  transaction.status = 'blocked';
  return receipt(transaction, error, { finalizationError });
}

function receipt(transaction, error, recovery = {}) {
  return {
    ...baseReceipt(transaction), committed: false,
    verification: transaction.verification,
    recoveryVerification: transaction.recoveryVerification,
    finalization: transaction.finalization,
    error: errorDetails(error),
    recovery: {
      required: transaction.status === 'recovery_required',
      restored: recovery.restored || null,
      verification: transaction.recoveryVerification,
      error: recovery.restoreError ? errorDetails(recovery.restoreError) : null,
      finalizationError: recovery.finalizationError
        ? errorDetails(recovery.finalizationError) : null
    }
  };
}

function baseReceipt(transaction) {
  return {
    schemaVersion: '1.0.0',
    transitionId: transaction.transitionId,
    topology: transaction.topology,
    status: transaction.status,
    snapshot: transaction.snapshot,
    phases: transaction.phases,
    promotionEligible: false
  };
}

function errorDetails(error) {
  return { code: error?.code || 'TOPOLOGY_MORPHOGENESIS_FAILED',
    message: error?.message || String(error) };
}

function coded(code, message) {
  return Object.assign(new Error(message), { code });
}

function text(value) { return typeof value === 'string' && value.trim().length > 0; }

module.exports = { REQUIRED_CAPABILITIES, executeTopologyMorphogenesis };
