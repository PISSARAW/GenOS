'use strict';

const controls = require('./admissionControl');
const { FRESH_MS } = require('./physiology');
const { digest } = require('./contract');
const TERMINAL = new Set(['RECOVERY_OBSERVED','REGRESSED','INCONCLUSIVE','REVOKED','EXPIRED','DENIED']);

function recovered(samples, baseline) {
  const recent = samples.filter(sample => sample.observedAt > baseline.observedAt).slice(0, 3);
  if (recent.length < 3 || recent.some(sample => sample.pressure > 0.4)) return false;
  const times = recent.map(sample => sample.observedAt);
  if (new Set(times).size !== 3 || Math.max(...times) - Math.min(...times) < 1000) return false;
  return recent.every(sample => sample.observedAt <= Date.now() && Date.now() - sample.observedAt <= FRESH_MS
    && sample.capacity === baseline.capacity && sample.queued <= baseline.queued);
}

function verdict(input) {
  const { sample, baseline, policy } = input;
  if (sample.capacity !== baseline.capacity) return { status: 'INCONCLUSIVE', reason: 'capacity_changed' };
  if (sample.queued > 0 && sample.oldestWaitMs > policy.maxQueueWaitMs
      && sample.oldestWaitMs > baseline.oldestWaitMs + 1000) {
    return { status: 'REGRESSED', reason: 'queue_wait_increased' };
  }
  if (recovered(input.samples, baseline)) return { status: 'RECOVERY_OBSERVED', reason: 'three_fresh_low_pressure_samples' };
  if (Date.now() - baseline.observedAt > FRESH_MS) return { status: 'INCONCLUSIVE', reason: 'observation_window_elapsed' };
  return null;
}

async function reconcile(input, row) {
  if (TERMINAL.has(row.status)) return;
  const episode = JSON.parse(row.body_json);
  const hold = await controls.read(input.db, row.effect_id);
  const effect = await input.runtime.store.effect(row.effect_id, episode.policy.scope);
  if (!hold) return reconcileAbsent(input, row, effect);
  if (!sameHold(hold, episode)) throw new Error('GNS_HOLD_IDENTITY_MISMATCH');
  if (!await stillAuthorized(input.db, episode.policy)) {
    await controls.release(input.db, row.effect_id);
    return input.journal.verdict(row.effect_id, { status: 'REVOKED', reason: 'policy_expired_or_replaced' });
  }
  if (!['CLAIMED','UNCERTAIN','EXECUTED_UNVERIFIED'].includes(effect?.status)) {
    await input.journal.verdict(row.effect_id, { status: 'UNCERTAIN', reason: 'effect_receipt_inconsistent' });
    return reconcileAbsent(input, row, effect);
  }
  if (['CLAIMED','UNCERTAIN'].includes(effect?.status)) await input.journal.reconcileEffect(row.effect_id);
  if (row.status !== 'EXECUTED_UNVERIFIED') await input.journal.verdict(row.effect_id,
    { status: 'EXECUTED_UNVERIFIED', reconciledFrom: 'persisted_admission_hold', automaticRetry: false });
  const outcome = verdict({ sample: input.sample, baseline: episode.baseline,
    policy: episode.policy, samples: input.samples });
  if (!outcome) return;
  await controls.release(input.db, row.effect_id);
  await input.journal.verdict(row.effect_id, { ...outcome, evidenceStatus: 'OPERATIONAL_OBSERVATION',
    effectInstalled: true, deniedAdmissions: row.denied_count,
    baselineSampleId: episode.baseline.id, afterSampleIds: input.samples
      .filter(sample => sample.observedAt > episode.baseline.observedAt).slice(0, 3).map(sample => sample.id),
    rollback: outcome.status === 'REGRESSED', causalAttribution: 'NOT_ESTABLISHED', businessSuccess: 'NOT_EVALUATED' });
}

async function stillAuthorized(db, policy) {
  const row = await db.get('SELECT version,enabled,expires_at FROM gns_regulation_policies WHERE manager_id=?', policy.managerId);
  if (row?.version !== policy.version || row.enabled !== 1 || row.expires_at <= Date.now()) return false;
  try { return digest(await require('./regulationPolicy').authorityKey(db, policy.scope.projectId)) === policy.authorityKeyHash; }
  catch (error) {
    if (error.message === 'GNS_AUTHORITY_REVOKED') return false;
    throw error;
  }
}

function sameHold(hold, episode) {
  return hold.effect_id === episode.effectId && hold.manager_id === episode.policy.managerId
    && hold.organization_id === episode.policy.scope.organizationId && hold.project_id === episode.policy.scope.projectId
    && hold.policy_version === episode.policy.version;
}

async function reconcileAbsent(input, row, effect) {
  if (effect?.status === 'CLAIMED') {
    await input.journal.verdict(row.effect_id, { status: 'UNCERTAIN', reason: 'claimed_without_durable_effect', automaticRetry: false });
  }
  const episode = JSON.parse(row.body_json);
  if (Date.now() - episode.baseline.observedAt <= FRESH_MS) return;
  await input.journal.verdict(row.effect_id, { status: 'INCONCLUSIVE', reason: 'no_persisted_effect_proof', automaticRetry: false });
}

module.exports = { TERMINAL, recovered, verdict, reconcile };
