'use strict';

const contract = require('./operationContractService');
function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && Array.isArray(value) === false;
}
function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}
function addErrors(target, items) {
  for (const item of items) target.push(item);
}
function admitOperation(operation, context) {
  context = context || {};
  const errors = [];
  const opCheck = contract.validateOperation(operation);
  if (opCheck.valid === false) addErrors(errors, opCheck.errors.map(toMessage));
  checkAuthority(operation, context, errors);
  checkLeases(operation, context, errors);
  checkBudget(operation, context, errors);
  checkScope(operation, context, errors);
  if (context.authorized === false) errors.push('not authorized');
  if (context.leaseValid === false) errors.push('lease invalid');
  const allowed = errors.length === 0;
  return { allowed, valid: allowed, status: allowed ? 'running' : 'unavailable', reason: allowed ? 'admitted' : errors.join('; '), errors };
}
function toMessage(error) {
  if (typeof error === 'string') return error;
  return error && error.message ? error.message : 'invalid';
}
function checkAuthority(operation, context, errors) {
  const authority = resolveAuthority(operation, context);
  if (authority === null) {
    errors.push('authority is required');
    return;
  }
  if (nonEmpty(authority.requester) === false) errors.push('authority.requester is required');
}
function resolveAuthority(operation, context) {
  if (context.authorization && isRecord(context.authorization)) return context.authorization;
  if (isRecord(operation && operation.authority)) return operation.authority;
  return null;
}
function checkLeases(operation, context, errors) {
  const authority = resolveAuthority(operation, context);
  const leases = Array.isArray(authority && authority.leases) ? authority.leases : [];
  const hasLeases = leases.length > 0;
  if (hasLeases === false && context.allowNoLease !== true) errors.push('at least one lease is required');
  for (const lease of leases) checkOneLease(lease, context, errors);
  if (Array.isArray(context.leases)) {
    for (const lease of context.leases) checkOneLease(lease, context, errors);
  }
}
function checkOneLease(lease, context, errors) {
  const scope = (context.scope) || (context.operation && context.operation.budget && context.operation.budget.dataScope);
  const dataScope = scope || (context.operation && context.operation.budget && context.operation.budget.dataScope);
  const check = validateLease(lease, { now: context.now, scope: dataScope });
  if (check.valid === false) addErrors(errors, check.errors);
}
function checkBudget(operation, context, errors) {
  const budget = operation && operation.budget;
  const bCheck = contract.validateBudget(budget || {});
  if (bCheck.valid === false) addErrors(errors, bCheck.errors.map(toMessage));
  if (context.budgetRemaining !== undefined && Number(context.budgetRemaining) <= 0) errors.push('budget exhausted');
  if (context.maxStepsRemaining !== undefined && Number(context.maxStepsRemaining) <= 0) errors.push('steps exhausted');
}
function checkScope(operation, context, errors) {
  const opScope = operation && operation.budget && operation.budget.dataScope;
  if (nonEmpty(context.scope) && nonEmpty(opScope)) {
    if (opScope !== context.scope) errors.push('scope mismatch');
  }
}
function validateLease(lease, options) {
  options = options || {};
  const now = options.now ? new Date(options.now).getTime() : Date.now();
  const errors = [];
  if (typeof lease === 'string') {
    if (nonEmpty(lease) === false) errors.push('lease id is required');
    return { valid: errors.length === 0, errors };
  }
  if (isRecord(lease) === false) {
    errors.push('lease must be a string or object');
    return { valid: false, errors };
  }
  checkLeaseRecord(lease, options, errors);
  return { valid: errors.length === 0, errors };
}
function checkLeaseRecord(lease, options, errors) {
  options = options || {};
  const now = options.now ? new Date(options.now).getTime() : Date.now();
  const id = lease.id !== undefined ? lease.id : lease.leaseId;
  if (nonEmpty(id) === false) errors.push('lease.id is required');
  if (lease.revoked === true) errors.push('lease revoked');
  checkLeaseExpiry(lease, now, errors);
  if (nonEmpty(options.scope)) {
    if (nonEmpty(lease.scope)) {
      if (lease.scope !== options.scope) errors.push('lease scope mismatch');
    }
  }
}
function checkLeaseExpiry(lease, now, errors) {
  const expires = (lease.expiresAt !== undefined) ? lease.expiresAt : lease.expires;
  if (expires === undefined || expires === null) return;
  const ts = typeof expires === 'number' ? expires : new Date(expires).getTime();
  if (Number.isFinite(ts) && ts <= now) errors.push('lease expired');
}
function revokeAuthority(operation, reason) {
  if (isRecord(operation && operation.authority)) {
    operation.authority.leases = [];
    operation.authority.revoked = true;
    operation.authority.revocationReason = nonEmpty(reason) ? reason : 'revoked';
  }
  return { revoked: true, reason: nonEmpty(reason) ? reason : 'revoked' };
}
function debitBudget(budget, amount) {
  if (isRecord(budget) === false) return { ok: false, reason: 'budget must be an object' };
  const cost = Number(amount);
  if (Number.isFinite(cost) === false || cost < 0) return { ok: false, reason: 'invalid debit amount' };
  if (budget.maxCost === undefined) budget.maxCost = 0;
  if (cost > budget.maxCost) return { ok: false, reason: 'budget exhausted', exhausted: true };
  budget.maxCost = budget.maxCost - cost;
  if (budget.maxSteps !== undefined && budget.maxSteps <= 0) {
    return { ok: false, reason: 'steps exhausted', exhausted: true };
  }
  return { ok: true, remaining: budget.maxCost, exhausted: budget.maxCost <= 0 };
}
function validateSnapshot(snapshot, context) {
  context = context || {};
  if (isRecord(snapshot) === false) return { valid: false, errors: ['snapshot must be an object'] };
  const errors = [];
  checkSnapshotIdentity(snapshot, errors);
  checkSnapshotBranch(snapshot, context, errors);
  checkSnapshotExecution(snapshot, context, errors);
  checkSnapshotIntegrity(snapshot, errors);
  checkSnapshotReceipt(snapshot, errors);
  return { valid: errors.length === 0, errors };
}
function checkSnapshotIdentity(snapshot, errors) {
  const id = snapshot.snapshotId || snapshot.id;
  if (nonEmpty(id) === false) errors.push('snapshot id is required');
}
function checkSnapshotBranch(snapshot, context, errors) {
  const branchId = snapshot.branchId || context.branchId;
  if (nonEmpty(branchId) === false) errors.push('snapshot must be linked to a branch');
  if (nonEmpty(context.branchId) && nonEmpty(snapshot.branchId) && snapshot.branchId !== context.branchId) {
    errors.push('snapshot branch mismatch');
  }
}
function checkSnapshotExecution(snapshot, context, errors) {
  const executionId = snapshot.executionId || snapshot.executionRunId || snapshot.runId || context.executionId || context.runId;
  if (nonEmpty(executionId) === false) errors.push('snapshot must be linked to an execution');
  if (nonEmpty(context.executionId) && nonEmpty(snapshot.executionId) && snapshot.executionId !== context.executionId) {
    errors.push('snapshot execution mismatch');
  }
}
function checkSnapshotIntegrity(snapshot, errors) {
  const integrity = snapshot.checksum || snapshot.hash || snapshot.integrity || snapshot.digest;
  if (nonEmpty(integrity) === false) errors.push('snapshot integrity is required');
}
function checkSnapshotReceipt(snapshot, errors) {
  const receipt = snapshot.receipt || snapshot.captureReceipt || snapshot.restoreReceipt;
  const hasReceiptId = nonEmpty(snapshot.receiptId) || nonEmpty(snapshot.captureReceiptId) || nonEmpty(snapshot.restoreReceiptId);
  if (isRecord(receipt) === false && hasReceiptId === false) {
    errors.push('capture or restore receipt is required');
    return;
  }
  if (isRecord(receipt)) {
    const rCheck = contract.validateReceipt(receipt);
    if (rCheck.valid === false) addErrors(errors, rCheck.errors.map(toMessage));
  }
}
function validateBudgetTransmission(parentBudget, childBudget) {
  const errors = [];
  const pCheck = contract.validateBudget(parentBudget || {});
  const cCheck = contract.validateBudget(childBudget || {});
  if (pCheck.valid === false) addErrors(errors, pCheck.errors.map(toMessage));
  if (cCheck.valid === false) addErrors(errors, cCheck.errors.map(toMessage));
  if (errors.length === 0) checkBudgetTransmissionValues(parentBudget, childBudget, errors);
  return { valid: errors.length === 0, errors };
}
function checkBudgetTransmissionValues(parentBudget, childBudget, errors) {
  if (Number(childBudget.maxCost) > Number(parentBudget.maxCost)) errors.push('child budget exceeds parent');
  if (Number(childBudget.maxSteps) > Number(parentBudget.maxSteps)) errors.push('child steps exceed parent');
  if (Number(childBudget.durationMs) > Number(parentBudget.durationMs)) errors.push('child duration exceeds parent');
}
function isBudgetExhausted(budget, usage) {
  const b = budget == null ? {} : budget;
  const u = usage == null ? {} : usage;
  if (costExhausted(b, u)) return true;
  if (stepsExhausted(b, u)) return true;
  return false;
}

function costExhausted(b, u) {
  if (b.maxCost === undefined) return false;
  if (Number(b.maxCost) <= 0) return true;
  if (u.cost === undefined) return false;
  if (Number(u.cost) > Number(b.maxCost)) return true;
  return false;
}

function stepsExhausted(b, u) {
  if (b.maxSteps === undefined) return false;
  if (Number(b.maxSteps) <= 0) return true;
  if (u.steps === undefined) return false;
  if (Number(u.steps) > Number(b.maxSteps)) return true;
  return false;
}
function validateEvidenceForClaim(evidence, claim, context) {
  context = context || {};
  if (isRecord(evidence) === false) {
    return { valid: false, errors: ['evidence must be an object'] };
  }
  const errors = [];
  const base = contract.validateEvidence(evidence);
  if (base.valid === false) addErrors(errors, base.errors.map(toMessage));
  checkClaim(evidence, claim, errors);
  checkEvidenceTyped(evidence, errors);
  checkEvidenceTraceable(evidence, errors);
  checkEvidenceClaimLink(evidence, claim, errors);
  return { valid: errors.length === 0, errors };
}
function claimIdOf(claim) {
  if (isRecord(claim)) return claim.id || claim.claimId;
  return claim;
}
function checkClaim(evidence, claim, errors) {
  const claimId = claimIdOf(claim);
  if (nonEmpty(claimId) === false && nonEmpty(claim) === false) errors.push('claim is required');
}
function checkEvidenceTyped(evidence, errors) {
  const typed = nonEmpty(evidence.type) || nonEmpty(evidence.evidenceType) || nonEmpty(evidence.kind) ||
    (Array.isArray(evidence.dimensions) && evidence.dimensions.some((d) => nonEmpty(d && d.provenance)));
  if (typed === false) errors.push('evidence must be typed');
}
function checkEvidenceTraceable(evidence, errors) {
  const traceable = nonEmpty(evidence.proofId) && isRecord(evidence.correlation);
  if (traceable === false) errors.push('evidence must be traceable');
}
function checkEvidenceClaimLink(evidence, claim, errors) {
  const claimId = claimIdOf(claim);
  if (nonEmpty(evidence.claimId) && nonEmpty(claimId) && evidence.claimId !== claimId) {
    errors.push('evidence not linked to claim');
  }
}
function canPromote(receipt, evidenceList) {
  evidenceList = Array.isArray(evidenceList) ? evidenceList : [];
  if (isRecord(receipt) === false) return false;
  if (receipt.status !== 'complete') return false;
  if (!Array.isArray(receipt.proofIds) || receipt.proofIds.length === 0) return false;
  if (evidenceList.length === 0) return true;
  return receipt.proofIds.every((proofId) => evidenceList.some((e) => isRecord(e) && e.proofId === proofId));
}
function closeOperation(operation, outcome) {
  return contract.buildReceipt(operation, outcome);
}
function resumeOperation(operation, state) {
  state = state || {};
  const errors = [];
  const opCheck = contract.validateOperation(operation);
  if (opCheck.valid === false) addErrors(errors, opCheck.errors.map(toMessage));
  checkResumeSnapshot(operation, state, errors);
  checkResumeBudget(state, errors);
  checkResumeReceipt(operation, state, errors);
  const allowed = errors.length === 0;
  return { allowed, valid: allowed, status: allowed ? 'running' : 'unavailable', reason: allowed ? 'resumed' : errors.join('; '), errors };
}
function checkResumeSnapshot(operation, state, errors) {
  if (isRecord(state.snapshot) === false) {
    errors.push('snapshot is required for resume');
    return;
  }
  const snap = validateSnapshot(state.snapshot, {
    branchId: operation && operation.correlation && operation.correlation.branchId,
    executionId: operation && operation.correlation && operation.correlation.runId
  });
  if (snap.valid === false) addErrors(errors, snap.errors);
}
function checkResumeBudget(state, errors) {
  const budget = state.budget || state.remainingBudget;
  if (isRecord(budget) === false) {
    errors.push('budget must be preserved on resume');
    return;
  }
  const bCheck = contract.validateBudget(budget);
  if (bCheck.valid === false) addErrors(errors, bCheck.errors.map(toMessage));
}
function checkResumeReceipt(operation, state, errors) {
  if (isRecord(state.receipt) === false) return;
  const rCheck = contract.validateReceipt(state.receipt);
  if (rCheck.valid === false) addErrors(errors, rCheck.errors.map(toMessage));
  const opId = operation && operation.correlation && operation.correlation.operationId;
  const receiptOpId = state.receipt.correlation && state.receipt.correlation.operationId;
  if (nonEmpty(receiptOpId) && receiptOpId !== opId) errors.push('receipt operation mismatch');
}
function adaptLegacy(input) {
  if (isRecord(input) === false) return { status: 'unavailable', partial: true, reason: 'input must be an object', operation: null };
  if (contract.validateOperation(input).valid) {
    return { status: 'adapted', partial: false, operation: input, reason: 'already canonical' };
  }
  const missing = collectMissingFields(input);
  if (missing.length > 0) {
    return { status: 'partial', partial: true, reason: 'missing fields: ' + missing.join(', '), operation: null, missing };
  }
  return { status: 'unavailable', partial: true, reason: 'cannot adapt', operation: null };
}
function collectMissingFields(input) {
  const missing = [];
  const hasIdempotency = nonEmpty(input.idempotencyKey) || nonEmpty(input.idempotency_key);
  if (hasIdempotency === false) missing.push('idempotencyKey');
  if (isRecord(input.correlation) === false) missing.push('correlation');
  if (isRecord(input.budget) === false) missing.push('budget');
  if (isRecord(input.authority) === false) missing.push('authority');
  if (nonEmpty(input.schemaVersion) === false) missing.push('schemaVersion');
  if (contract.OPERATION_KINDS.includes(input.operationKind) === false) missing.push('operationKind');
  return missing;
}
function markPartial(reason) {
  return { status: 'partial', reason: nonEmpty(reason) ? reason : 'partial' };
}
function markUnavailable(reason) {
  return { status: 'unavailable', reason: nonEmpty(reason) ? reason : 'unavailable' };
}
function isPartial(value) {
  return isRecord(value) && value.status === 'partial';
}
function isUnavailable(value) {
  return isRecord(value) && value.status === 'unavailable';
}
function complianceMatrix() {
  const entries = [];
  const entryPoints = ['api', 'cli', 'mcp', 'orchestration', 'worker', 'resume'];
  const terminals = contract.TERMINAL_STATES;
  for (const entry of entryPoints) {
    for (const terminal of terminals) {
      entries.push({
        entryPoint: entry,
        terminalState: terminal,
        gate: 'operationLifecycle',
        controls: ['authorization', 'lease', 'budget', 'scope', 'receipt', 'evidence'],
        requiredEvidence: terminal === 'complete'
      });
    }
  }
  return entries;
}
function assertNoBypass(operation, context) {
  const admission = admitOperation(operation, context);
  if (admission.allowed !== true) {
    const err = new Error('operation gate denied: ' + admission.reason);
    err.code = 'OPERATION_GATE_DENIED';
    err.errors = admission.errors;
    throw err;
  }
  return admission;
}

const gate = {
  admitOperation,
  admit: admitOperation,
  checkAdmission: admitOperation,
  gateAdmission: admitOperation,
  validateLease,
  revokeAuthority,
  revokeLease: revokeAuthority,
  debitBudget,
  debit: debitBudget,
  validateSnapshot,
  validateSnapshotIntegrity: validateSnapshot,
  validateBudgetTransmission,
  isBudgetExhausted,
  budgetExhausted: isBudgetExhausted,
  validateEvidenceForClaim,
  validateEvidence: validateEvidenceForClaim,
  canPromote,
  promotionAllowed: canPromote,
  closeOperation,
  close: closeOperation,
  buildReceipt: contract.buildReceipt,
  resumeOperation,
  resume: resumeOperation,
  adaptLegacy,
  adapt: adaptLegacy,
  markPartial,
  markUnavailable,
  isPartial,
  isUnavailable,
  complianceMatrix,
  assertNoBypass
};

module.exports = gate;
module.exports.default = gate;
module.exports.OperationLifecycleGate = gate;
Object.keys(gate).forEach((key) => { module.exports[key] = gate[key]; });
module.exports.OPERATION_KINDS = contract.OPERATION_KINDS;
module.exports.TERMINAL_STATES = contract.TERMINAL_STATES;
