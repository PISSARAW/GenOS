'use strict';
const { hashWorkspace } = require('./trinitySnapshotService');

async function assertCandidate(artifact, hash) {
  if (!artifact?.targetWorkspace || !hash || await hashWorkspace(artifact.targetWorkspace) !== hash) {
    throw Object.assign(new Error('Trinity candidate no longer matches verified content.'), { code: 'TRINITY_CANDIDATE_HASH_CHANGED' });
  }
}
async function previousPromotion(input) {
  const { db, missionId } = input;
  if (!missionId) return null;
  const experiment = await db.get('SELECT status, decision_json, failure_reason FROM trinity_experiments WHERE mission_id = ?', missionId);
  if (!experiment || !['promoted', 'promotion_failed'].includes(experiment.status)) return null;
  const decision = JSON.parse(experiment.decision_json || '{}');
  const result = promotionRecord(experiment, decision);
  if (!result.promoted) return result;
  try {
    await assertCandidate(result.artifact, result.verification?.contentHash);
    await assertSignedReference(db, result);
    return result;
  } catch (error) { return { ...result, promoted: false, reason: error.code || 'TRINITY_PROMOTION_INTEGRITY_FAILED' }; }
}
function promotionRecord(experiment, decision) {
  return { promoted: experiment.status === 'promoted', idempotent: true,
    reason: decision.reason || experiment.failure_reason || null, worldNumber: decision.worldNumber,
    jury: decision.jury || null, artifact: decision.artifact || decision.candidateArtifact || null,
    verification: decision.verification || null, agentGit: decision.agentGit || null };
}

async function assertSignedReference(db, result) {
  const git = require('./agentGitService');
  const object = await git.getObject(db, { user: { username: 'trinity-runtime' }, body: {} }, result.agentGit?.objectId);
  const metadata = JSON.parse(object?.metadata_json || '{}');
  if (!object || !git.verifyObjectSignature(object) || metadata.contentHash !== result.verification.contentHash) {
    throw Object.assign(new Error('Trinity signed reference is missing or changed.'), { code: 'TRINITY_PROMOTION_SIGNATURE_INVALID' });
  }
}
module.exports = { assertCandidate, previousPromotion };
