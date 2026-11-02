'use strict';

const { digest, verifyContract } = require('../../qualityElevation/qualityContract');
const { artifactPayload } = require('../../aTeamHandoffEvidenceService');
const { latestReport } = require('../../trinityWorldReports');

function qualityContract(member) {
  const contract = member.qualityElevation || member.workerContract?.qualityElevation;
  return contract ? verifyContract(contract) : null;
}

function qualityObligation(member, verdict) {
  const contract = qualityContract(member), obligation = verdict?.repairObligation;
  if (!contract || obligation?.reason !== 'acceptance_criteria_unverified') return null;
  const names = new Set(contract.criteria.flatMap((item) => [item.id, item.description]));
  const missing = obligation.unverifiedCriteria || [];
  return missing.length && missing.every((name) => names.has(name)) ? obligation : null;
}

function artifactIdentity(dossier) {
  const report = latestReport(dossier);
  return { report, reportDigest: digest(report || {}), artifactDigest: digest(artifactPayload(report || {}) ?? '') };
}

function classifyCode(code = '') {
  if (/CANCEL/.test(code)) return 'cancelled';
  if (/BUDGET|TIMEOUT|TIMED_OUT|DEADLINE/.test(code)) return 'budget';
  if (/AUTHORITY|LEASE|SANDBOX|CONTRACT_CHANGED|PERMISSION/.test(code)) return 'authority';
  if (/MODEL_MISMATCH|PROVIDER|OLLAMA|NETWORK|CONTEXT|EXECUTOR|DISPATCH/.test(code)) return 'infrastructure';
  return 'quality';
}

function terminalFeedback(report) {
  const quality = report?.qualityFeedback || report?.qualityElevation;
  if (!quality) return null;
  if (quality.finalStatus === 'promoted' && (quality.qualitySatisfied === true || quality.promoted === true)) return null;
  return stoppedFeedback(quality);
}

function stoppedFeedback(quality) {
  const status = quality.finalStatus || quality.status;
  const code = quality.terminalError?.code || quality.code || '';
  if (!status && !code) return null;
  return { status: status === 'stagnated' ? 'stagnated' : 'needs_review',
    category: classifyCode(code), reason: code || status, automaticRepair: false };
}

function requestFor(input) {
  return { schema: 'genos.quality-repair-request/v1', teamRunId: input.run.teamRunId,
    memberId: input.member.memberId, attempt: input.attempt,
    previousArtifactDigest: input.identity.artifactDigest,
    unverifiedCriteria: [...input.obligation.unverifiedCriteria], reason: input.obligation.reason };
}

function maximumAttempts(member) {
  return Math.min(qualityContract(member).maxStrategyMutations, 2);
}

module.exports = { qualityContract, qualityObligation, artifactIdentity, classifyCode,
  terminalFeedback, requestFor, maximumAttempts };
