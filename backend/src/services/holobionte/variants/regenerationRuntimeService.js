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
  const cryptobiosisEligible = planRegenerationCryptobiosisEligible(damage, input);
  const reservation = planRegenerationReservation(damage, input, candidate);
  const resourcesReserved = planRegenerationResourcesReserved(damage, reservation, input);
  return { status, replacementCandidate: canReplace ? candidate : null, reserveRequired: damage > 0,
    resourcesReserved, reservationReceipt: resourcesReserved && damage > 0 ? reservation : null,
    controlledApoptosisAllowed: apoptosisAllowed(input, canReplace, candidate) && resourcesReserved, evidenceRefs,
    cryptobiosisEligible };
}

function simulateRegeneration(input = {}) {
  const stages = Array.isArray(input.stages) ? input.stages : [];
  if (!stages.length || stages.length > 20) throw Object.assign(new Error('Regeneration simulation requires 1–20 stages.'), { code: 'HOLOBIONT_REGENERATION_INVALID' });
  let previousTick = -1;
  const history = stages.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Object.assign(new Error(`Stage ${index + 1} must be an object.`), { code: 'HOLOBIONT_REGENERATION_INVALID' });
    const tick = Number(raw.tick);
    if (simulateRegenerationCondition(tick, previousTick)) {
      throw Object.assign(new Error('Regeneration stage ticks must increase.'), { code: 'HOLOBIONT_REGENERATION_INVALID' });
    }
    previousTick = tick;
    const damage = bounded(raw.damageScore, `stage ${index + 1} damageScore`);
    return { tick, damageScore: damage, evidenceRefs: damage > 0 ? evidence(raw.evidenceRefs) : [] };
  });
  const delta = history.at(-1).damageScore - history[0].damageScore;
  return simulateRegenerationResult(delta, history);
}

module.exports = { planRegeneration, simulateRegeneration };

function planRegenerationCryptobiosisEligible(damage, input) {
  return damage >= 0.8 && input.persistentHost === true
    && typeof input.verifyRecoverySnapshot === 'function'
    && input.verifyRecoverySnapshot(input.recoverySnapshot) === true;
}

function planRegenerationResourcesReserved(damage, reservation, input) {
  return damage === 0 || (reservation !== null
    && typeof input.verifyRecoveryReservation === 'function' && input.verifyRecoveryReservation(reservation) === true);
}

function planRegenerationReservation(damage, input, candidate) {
  return damage > 0 && typeof input.reserveRecoveryResources === 'function'
    ? input.reserveRecoveryResources({ damage, candidate }) : null;
}

function simulateRegenerationResult(delta, history) {
  return { status: delta < 0 ? 'RECOVERING' : delta > 0 ? 'WORSENING' : 'STABLE', history,
    damageDelta: delta, replacementAuthorized: false, automaticApoptosis: false };
}

function simulateRegenerationCondition(tick, previousTick) {
  return !Number.isInteger(tick) || tick < 0 || tick <= previousTick;
}
