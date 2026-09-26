'use strict';

function bounded(value, field) {
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0 || result > 1) {
    throw Object.assign(new Error(`${field} must be between 0 and 1.`), { code: 'HOLOBIONT_REGENERATION_INVALID' });
  }
  return result;
}

function evidence(value) {
  const refs = Array.isArray(value) ? [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))] : [];
  if (!refs.length) throw Object.assign(new Error('Recovery evidence is required.'), { code: 'HOLOBIONT_EVIDENCE_REQUIRED' });
  return refs;
}

function replacementEligibility(context) {
  const { input, damage, candidate } = context;
  const testsPassed = typeof input.verifyRestoration === 'function'
    && input.verifyRestoration(input.restorationReceipt) === true;
  const lineageSafe = typeof input.verifyLineage === 'function' && input.verifyLineage(candidate) === true;
  return damage >= Number(input.damageThreshold ?? 0.5) && Boolean(candidate) && testsPassed && lineageSafe;
}

function apoptosisAllowed(input, canReplace, candidate) {
  return Boolean(canReplace && typeof input.approveApoptosis === 'function' && input.approveApoptosis(candidate) === true);
}

function planRegeneration(input = {}) {
  const damage = bounded(input.damageScore, 'damageScore');
  const evidenceRefs = damage > 0 ? evidence(input.evidenceRefs) : [];
  const candidate = input.replacementCandidate || null;
  const canReplace = replacementEligibility({ input, damage, candidate });
  const status = damage === 0 ? 'HEALTHY' : canReplace ? 'REPLACEMENT_READY' : 'RECOVERY_REQUIRED';
  const cryptobiosisEligible = damage >= 0.8 && input.persistentHost === true
    && typeof input.verifyRecoverySnapshot === 'function'
    && input.verifyRecoverySnapshot(input.recoverySnapshot) === true;
  return { status, replacementCandidate: canReplace ? candidate : null, reserveRequired: damage > 0,
    controlledApoptosisAllowed: apoptosisAllowed(input, canReplace, candidate), evidenceRefs,
    cryptobiosisEligible };
}

module.exports = { planRegeneration };
