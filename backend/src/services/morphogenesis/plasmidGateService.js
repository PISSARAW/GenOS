'use strict';

/**
 * Plasmid Gate Service — enforces five gates before plasmid expression:
 *   1. Integrity       — plasmid code is valid and complete
 *   2. Compatibility   — recipient phenotype can express this capability
 *   3. Authority       — recipient authority profile permits it
 *   4. Immune          — recipient immune system does not reject it
 *   5. Lease           — recipient tool lease includes all required tools
 *
 * Critical invariant: plasmid ≠ permission. Even with a plasmid grant,
 * the runtime lease must still include the required tools.
 *
 * Lifecycle: active → disabled/superseded → expired
 * All transitions are recorded in an immutable per-plasmid history log.
 */

const VALID_STATUSES = Object.freeze(['active', 'disabled', 'superseded', 'expired']);

const historyLog = new Map();

function checkIntegrity(plasmid) {
  const errors = [];
  if (!plasmid) return { valid: false, errors: ['Plasmid is null or undefined'] };
  if (!plasmid.id) errors.push('Plasmid ID is missing');
  if (!plasmid.code || (typeof plasmid.code === 'string' && !plasmid.code.trim())) {
    errors.push('Plasmid code is missing or empty');
  }
  if (!Array.isArray(plasmid.requiredTools)) {
    errors.push('requiredTools must be an array');
  }
  if (!plasmid.requiredAuthority) {
    errors.push('requiredAuthority is missing');
  }
  return { valid: errors.length === 0, errors };
}

function capabilityReasons(plasmid, recipient) {
  const reasons = [];
  const caps = Array.isArray(plasmid.capabilities) ? plasmid.capabilities : [];
  for (const cap of caps) {
    if (typeof recipient.canExpress === 'function' && !recipient.canExpress(cap)) {
      reasons.push(`Phenotype cannot express capability: ${cap}`);
    }
  }
  return reasons;
}

function checkCompatibility(plasmid, recipient) {
  if (!recipient) return { compatible: false, reasons: ['Recipient is null'] };
  const phenotype = recipient.phenotype || recipient.phenotypeId;
  if (!phenotype) return { compatible: false, reasons: ['Recipient phenotype is unknown'] };
  const reasons = capabilityReasons(plasmid, recipient);
  const profile = recipient.authorityProfile;
  if (profile && plasmid.requiredAuthority && !profile[plasmid.requiredAuthority]) {
    reasons.push(`Phenotype authority profile lacks: ${plasmid.requiredAuthority}`);
  }
  return { compatible: reasons.length === 0, reasons };
}

function checkAuthority(plasmid, recipient) {
  if (!recipient) return { allowed: false, reason: 'Recipient is null' };
  const required = plasmid.requiredAuthority;
  if (!required) return { allowed: false, reason: 'Plasmid has no requiredAuthority' };
  const profile = recipient.authorityProfile;
  if (!profile) return { allowed: false, reason: 'Recipient has no authorityProfile' };
  if (!profile[required]) {
    return { allowed: false, reason: `Recipient lacks required authority: ${required}` };
  }
  return { allowed: true };
}

function checkImmune(plasmid, recipient) {
  if (!recipient) return { accepted: false, reason: 'Recipient is null' };
  const status = recipient.immuneStatus;
  if (status === 'rejected') {
    return { accepted: false, reason: 'Recipient immune system has rejected this plasmid' };
  }
  if (status === 'compromised') {
    return { accepted: false, reason: 'Recipient immune system is compromised' };
  }
  const rejections = recipient.immuneRejections || [];
  if (Array.isArray(rejections) && rejections.indexOf(plasmid.id) !== -1) {
    return { accepted: false, reason: 'Plasmid is in recipient immune rejection list' };
  }
  return { accepted: true };
}

function checkLease(plasmid, recipient) {
  if (!recipient) return { allowed: false, missingTools: [] };
  const required = Array.isArray(plasmid.requiredTools) ? plasmid.requiredTools : [];
  const lease = recipient.toolLease || [];
  const leaseSet = new Set(lease);
  const missing = [];
  for (const tool of required) {
    if (!leaseSet.has(tool)) missing.push(tool);
  }
  return { allowed: missing.length === 0, missingTools: missing };
}

const GATE_SEQUENCE = Object.freeze([
  { name: 'integrity', fn: checkIntegrity, key: 'valid', failMsg: 'Integrity gate failed' },
  { name: 'compatibility', fn: checkCompatibility, key: 'compatible', failMsg: 'Compatibility gate failed' },
  { name: 'authority', fn: checkAuthority, key: 'allowed', failMsg: 'Authority gate failed' },
  { name: 'immune', fn: checkImmune, key: 'accepted', failMsg: 'Immune gate failed' },
  { name: 'lease', fn: checkLease, key: 'allowed', failMsg: 'Lease gate failed' },
]);

function evaluateAllGates(plasmid, recipient) {
  const result = {
    plasmidId: plasmid ? plasmid.id : null,
    recipientId: recipient ? recipient.id : null,
    gates: {},
    passed: false,
    timestamp: new Date().toISOString(),
  };
  for (const gate of GATE_SEQUENCE) {
    const gateResult = gate.fn(plasmid, recipient);
    result.gates[gate.name] = gateResult;
    if (!gateResult[gate.key]) {
      result.reason = gate.failMsg;
      return result;
    }
  }
  result.passed = true;
  return result;
}

function transitionStatus(plasmidId, newStatus, reason) {
  if (!plasmidId) return { success: false, error: 'plasmidId is required' };
  if (VALID_STATUSES.indexOf(newStatus) === -1) {
    return {
      success: false,
      error: `Invalid status: ${newStatus}. Must be one of ${VALID_STATUSES.join(', ')}`,
    };
  }
  if (!historyLog.has(plasmidId)) {
    historyLog.set(plasmidId, []);
  }
  const history = historyLog.get(plasmidId);
  const entry = {
    fromStatus: history.length ? history[history.length - 1].status : 'active',
    status: newStatus,
    reason: reason || '',
    timestamp: new Date().toISOString(),
  };
  history.push(entry);
  return { success: true, entry };
}

function getPlasmidHistory(plasmidId) {
  if (!plasmidId) return [];
  return historyLog.get(plasmidId) || [];
}

module.exports = {
  VALID_STATUSES,
  checkIntegrity,
  checkCompatibility,
  checkAuthority,
  checkImmune,
  checkLease,
  evaluateAllGates,
  transitionStatus,
  getPlasmidHistory,
};
