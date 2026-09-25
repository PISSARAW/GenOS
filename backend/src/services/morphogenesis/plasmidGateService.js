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
 * Lifecycle: available → leased → assimilated, with explicit terminal states.
 * History reads return immutable snapshots; the backing log is process-local.
 */

const VALID_STATUSES = Object.freeze(['available', 'leased', 'assimilated', 'disabled', 'superseded', 'expired', 'revoked']);
const STATUS_TRANSITIONS = Object.freeze({
  available: ['leased', 'disabled', 'superseded', 'expired', 'revoked'],
  leased: ['available', 'assimilated', 'expired', 'revoked'],
  assimilated: ['disabled', 'superseded', 'expired', 'revoked'],
  disabled: ['available', 'expired', 'revoked'],
  superseded: ['expired'],
  expired: [],
  revoked: []
});

const historyLog = new Map();

function checkIntegrity(plasmid) {
  if (!plasmid) return { valid: false, errors: ['Plasmid is null or undefined'] };
  const errors = [...identityErrors(plasmid), ...codeErrors(plasmid), ...toolErrors(plasmid), ...authorityErrors(plasmid)];
  return { valid: errors.length === 0, errors };
}

function identityErrors(plasmid) {
  return [
    ...(typeof plasmid.id === 'string' && plasmid.id.trim() ? [] : ['Plasmid ID is missing']),
    ...(typeof plasmid.capability === 'string' && plasmid.capability.trim() ? [] : ['Plasmid capability is missing'])
  ];
}

function codeErrors(plasmid) {
  return typeof plasmid.code === 'string' && plasmid.code.trim() ? [] : ['Plasmid code is missing or empty'];
}

function toolErrors(plasmid) {
  if (!Array.isArray(plasmid.requiredTools)) return ['requiredTools must be an array of non-empty strings'];
  return plasmid.requiredTools.some((tool) => typeof tool !== 'string' || !tool.trim())
    ? ['requiredTools must be an array of non-empty strings'] : [];
}

function authorityErrors(plasmid) {
  return typeof plasmid.requiredAuthority === 'string' && plasmid.requiredAuthority.trim()
    ? [] : ['requiredAuthority is missing'];
}

function capabilityReasons(plasmid, recipient) {
  const reasons = [];
  const caps = Array.isArray(plasmid.capabilities)
    ? plasmid.capabilities
    : (plasmid.capability ? [plasmid.capability] : []);
  for (const cap of caps) {
    const canExpress = typeof recipient.canExpress === 'function'
      ? recipient.canExpress(cap)
      : Array.isArray(recipient.capabilities) && recipient.capabilities.includes(cap);
    if (!canExpress) {
      reasons.push(`Phenotype cannot express capability: ${cap}`);
    }
  }
  return reasons;
}

function checkCompatibility(plasmid, recipient) {
  if (!plasmid) return { compatible: false, reasons: ['Plasmid is missing'] };
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
  if (!plasmid) return { allowed: false, reason: 'Plasmid is missing' };
  if (!recipient) return { allowed: false, reason: 'Recipient is null' };
  const required = plasmid.requiredAuthority;
  if (!required) return { allowed: false, reason: 'Plasmid has no requiredAuthority' };
  const profile = recipient.authorityProfile;
  if (!profile) return { allowed: false, reason: 'Recipient has no authorityProfile' };
  if (profile[required] !== true) {
    return { allowed: false, reason: `Recipient lacks required authority: ${required}` };
  }
  return { allowed: true };
}

function checkImmune(plasmid, recipient) {
  if (!plasmid) return { accepted: false, reason: 'Plasmid is missing' };
  if (!recipient) return { accepted: false, reason: 'Recipient is null' };
  const reason = immuneRejectionReason(plasmid, recipient);
  return reason ? { accepted: false, reason } : { accepted: true };
}

function immuneRejectionReason(plasmid, recipient) {
  const status = recipient.immuneStatus;
  if (status === 'rejected') return 'Recipient immune system has rejected this plasmid';
  if (status === 'compromised') return 'Recipient immune system is compromised';
  if (!['clear', 'healthy', 'active'].includes(status)) return 'Recipient immune status is unknown';
  return Array.isArray(recipient.immuneRejections) && recipient.immuneRejections.includes(plasmid.id)
    ? 'Plasmid is in recipient immune rejection list' : null;
}

function checkLease(plasmid, recipient) {
  if (!plasmid) return { allowed: false, missingTools: [] };
  if (!recipient) return { allowed: false, missingTools: [] };
  const required = Array.isArray(plasmid.requiredTools) ? plasmid.requiredTools : [];
  const lease = Array.isArray(recipient.toolLease) ? recipient.toolLease : [];
  const leaseSet = new Set(lease);
  const missing = required.filter((tool) => !leaseSet.has(tool));
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
    if (!gateResult[gate.key]) (result.reasons ||= []).push(gate.failMsg);
  }
  result.passed = !result.reasons;
  if (result.reasons) result.reason = result.reasons[0];
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
  const currentStatus = history.length ? history[history.length - 1].status : 'available';
  if (!STATUS_TRANSITIONS[currentStatus]?.includes(newStatus) && currentStatus !== newStatus) {
    return { success: false, error: `Invalid plasmid status transition: ${currentStatus} -> ${newStatus}` };
  }
  const entry = {
    fromStatus: currentStatus,
    status: newStatus,
    reason: reason || '',
    timestamp: new Date().toISOString(),
  };
  history.push(entry);
  return { success: true, entry };
}

function getPlasmidHistory(plasmidId) {
  if (!plasmidId) return [];
  return Object.freeze([...(historyLog.get(plasmidId) || [])].map((entry) => Object.freeze({ ...entry })));
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
