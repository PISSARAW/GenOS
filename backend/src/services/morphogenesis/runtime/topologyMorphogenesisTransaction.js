'use strict';

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
    recoveryArmed: false,
    adaptation: null,
    verification: null,
    finalization: null
  };
}

async function executePhases(transaction, input) {
  await phase(transaction, input, 'observe');
  const quiescence = await phase(transaction, input, 'quiesce');
  assertReceipt(quiescence?.quiescent === true, 'TOPOLOGY_MORPHOGENESIS_NOT_QUIESCENT',
    'The topology did not prove quiescence.');
  transaction.snapshot = await phase(transaction, input, 'snapshot');
  transaction.snapshot = sealSnapshot(transaction.snapshot);
  transaction.recoveryArmed = true;
  transaction.status = 'applying';
  transaction.adaptation = await phase(transaction, input, 'adapt');
  assertReceipt(transaction.adaptation?.applied === true,
    'TOPOLOGY_MORPHOGENESIS_ADAPTATION_UNCONFIRMED', 'The adaptation was not confirmed.');
  transaction.verification = await input.verify(verificationInput(transaction, input));
  assertVerification(transaction.verification);
  transaction.phases.push({ capability: 'verify', status: 'completed' });
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
    snapshot: transaction.snapshot,
    adaptation: transaction.adaptation,
    verification: transaction.verification
  });
  transaction.phases.push({ capability, status: 'completed' });
  return result;
}

function verificationInput(transaction, input) {
  return {
    transitionId: transaction.transitionId,
    topology: transaction.topology,
    plan: input.plan || {},
    snapshot: transaction.snapshot,
    adaptation: transaction.adaptation,
    context: input.context || {}
  };
}

function sealSnapshot(snapshot) {
  const valid = snapshot?.restorable === true
    && typeof snapshot.snapshotId === 'string' && snapshot.snapshotId
    && typeof snapshot.hash === 'string' && snapshot.hash;
  assertReceipt(valid, 'TOPOLOGY_MORPHOGENESIS_SNAPSHOT_NOT_RESTORABLE',
    'The snapshot is not explicitly restorable and sealed.');
  return Object.freeze(structuredClone(snapshot));
}

function assertVerification(verification) {
  const refs = verification?.evidenceRefs;
  const valid = verification?.verified === true && Array.isArray(refs)
    && refs.some((reference) => typeof reference === 'string' && reference.trim());
  assertReceipt(valid, 'TOPOLOGY_MORPHOGENESIS_VERIFICATION_FAILED',
    'Independent verification with evidence references is required.');
}

function assertReceipt(condition, code, message) {
  if (!condition) throw coded(code, message);
}

async function failureReceipt(transaction, input, error) {
  if (!transaction.recoveryArmed) return blockedReceipt(transaction, error);
  try {
    const restored = await phase(transaction, input, 'restore');
    assertRestore(restored, transaction.snapshot);
    transaction.status = 'restored';
    return receipt(transaction, error, { restored });
  } catch (restoreError) {
    transaction.status = 'recovery_required';
    return receipt(transaction, error, { restoreError });
  }
}

function assertRestore(restored, snapshot) {
  const valid = restored?.restored === true && restored?.verified === true
    && restored.snapshotId === snapshot.snapshotId && restored.hash === snapshot.hash;
  assertReceipt(valid, 'TOPOLOGY_MORPHOGENESIS_RESTORE_UNVERIFIED',
    'Restore receipt does not match the sealed snapshot.');
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

function blockedReceipt(transaction, error) {
  transaction.status = 'blocked';
  return receipt(transaction, error);
}

function receipt(transaction, error, recovery = {}) {
  return {
    ...baseReceipt(transaction), committed: false,
    verification: transaction.verification,
    finalization: transaction.finalization,
    error: errorDetails(error),
    recovery: {
      required: transaction.status === 'recovery_required',
      restored: recovery.restored || null,
      error: recovery.restoreError ? errorDetails(recovery.restoreError) : null
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
    phases: transaction.phases
  };
}

function errorDetails(error) {
  return { code: error?.code || 'TOPOLOGY_MORPHOGENESIS_FAILED',
    message: error?.message || String(error) };
}

function coded(code, message) {
  return Object.assign(new Error(message), { code });
}

module.exports = { REQUIRED_CAPABILITIES, executeTopologyMorphogenesis };
