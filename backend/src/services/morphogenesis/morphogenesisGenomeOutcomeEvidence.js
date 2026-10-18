'use strict';

const outcomeStore = require('./morphogenesisVerifiedOutcomeStore');

function resultHash(result) {
  return result?.genomeBinding?.contentHash || result?.genomeContentHash || null;
}

function allResultsUse(attempt, contentHash) {
  const results = attempt?.workerResults;
  return Array.isArray(results) && results.length > 0
    && results.every((result) => result.status === 'completed' && resultHash(result) === contentHash);
}

function transitionUses(outcome, contentHash) {
  const bindings = outcome?.pairEvidence?.transitionReceipt?.identity?.bindings;
  return Array.isArray(bindings) && bindings.length > 0
    && bindings.every((binding) => binding.genomeBinding?.contentHash === contentHash);
}

function fingerprintsMatch(outcome, evidence) {
  const pair = outcome?.pairEvidence;
  return transitionUses(outcome, evidence.candidateContentHash)
    && allResultsUse(pair?.candidate, evidence.candidateContentHash)
    && allResultsUse(pair?.control, evidence.parentContentHash);
}

function evidenceIdentityMatches(context) {
  const { evidence, model, parent } = context;
  if (!evidence.outcomeId || !evidence.missionId || !model || !parent) return false;
  if (evidence.candidateContentHash === evidence.parentContentHash) return false;
  return model.contentHash === evidence.candidateContentHash
    && parent.contentHash === evidence.parentContentHash;
}

async function verifyGenomeOutcomeEvidence(db, context) {
  const { row, evidence, model, parent } = context;
  if (!evidenceIdentityMatches({ evidence, model, parent })) return false;
  const outcome = await outcomeStore.loadVerifiedOutcome(db, {
    missionId: evidence.missionId,
    organizationId: row.organization_id || null,
    projectId: row.project_id || null
  }, evidence.outcomeId);
  return Boolean(outcome && outcome.actualGain > 0 && fingerprintsMatch(outcome, evidence));
}

module.exports = { allResultsUse, fingerprintsMatch, transitionUses, verifyGenomeOutcomeEvidence };
