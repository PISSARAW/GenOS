'use strict';

function campaignIdentityFailures(results) {
  const failures = [];
  if (results.schemaVersion !== 1 || !results.suiteId || !/^[a-f0-9]{40}$/i.test(results.gitCommit || '')) failures.push('campaign identity or source commit missing');
  if (!/^[a-f0-9]{64}$/.test(results.suiteSha256 || '')) failures.push('suite digest missing');
  if (!results.sourceState || typeof results.sourceState.confirmatoryEligible !== 'boolean') failures.push('source tree state missing');
  return failures;
}

function missionEvidenceFailures(mission) {
  const failures = [];
  if (!mission.missionFile || !/^[a-f0-9]{64}$/.test(mission.missionSha256 || '')) failures.push(`${mission.name}: mission provenance missing`);
  if (mission.receiptObjectSha256 !== null && !/^[a-f0-9]{64}$/.test(mission.receiptObjectSha256 || '')) failures.push(`${mission.name}: invalid receipt digest`);
  if (!Array.isArray(mission.workers) || typeof mission.verification?.passed !== 'boolean') failures.push(`${mission.name}: execution evidence incomplete`);
  if (!mission.oracleVerification?.status) failures.push(`${mission.name}: oracle scope missing`);
  if (!mission.mechanismEvidence?.status) failures.push(`${mission.name}: mechanism evidence scope missing`);
  return failures;
}

function validateCampaignEvidence(results) {
  const failures = campaignIdentityFailures(results);
  for (const mission of results.missions) failures.push(...missionEvidenceFailures(mission));
  if (failures.length) throw new Error(`Invalid campaign evidence: ${failures.join('; ')}`);
}

module.exports = { validateCampaignEvidence };
