'use strict';

function required(value, field) {
  const result = String(value || '').trim();
  if (!result) throw Object.assign(new Error(`${field} is required.`), { code: 'HOLOBIONT_VARIANT_RUNTIME_INVALID' });
  return result;
}

function verifiedTrial(input, championId) {
  const trials = Array.isArray(input.trials) ? input.trials : [];
  const trial = trials.find((item) => item?.id === championId);
  const refs = Array.isArray(trial?.evidenceRefs) ? trial.evidenceRefs : [];
  return Boolean(trial && refs.length && typeof input.verifyTrial === 'function'
    && input.verifyTrial(championId, refs) === true);
}

function authorizeCompetitiveReplacement(input = {}) {
  const championId = required(input.championId, 'championId');
  const trialVerified = verifiedTrial(input, championId);
  const restored = typeof input.verifyRestoration === 'function'
    && input.verifyRestoration(input.restorationReceipt) === true;
  const rollbackSafe = typeof input.verifyRollbackSnapshot === 'function'
    && input.verifyRollbackSnapshot(input.rollbackSnapshot) === true;
  const approved = typeof input.approveReplacement === 'function'
    && input.approveReplacement(championId) === true;
  return authorizeCompetitiveReplacementResult({ championId, trialVerified, restored, rollbackSafe, approved });
}

module.exports = { authorizeCompetitiveReplacement };

function authorizeCompetitiveReplacementResult({ championId, trialVerified, restored, rollbackSafe, approved }) {
  return { championId, replacementAuthorized: trialVerified && restored && rollbackSafe && approved,
    blockedReasons: [!trialVerified && 'TRIAL_NOT_VERIFIED', !restored && 'RESTORATION_NOT_VERIFIED',
      !rollbackSafe && 'ROLLBACK_SNAPSHOT_NOT_VERIFIED', !approved && 'APPROVAL_REQUIRED'].filter(Boolean) };
}
