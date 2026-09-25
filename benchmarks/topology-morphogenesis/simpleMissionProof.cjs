'use strict';

function evidenceText(receipt) {
  const event = receipt?.telemetry?.find((entry) => entry.event_type === 'EVIDENCE_REPORT');
  if (!event?.payload_json) return '';
  try {
    const payload = JSON.parse(event.payload_json);
    const report = payload.evidenceReport || payload.report || payload;
    const claims = [
      ...(Array.isArray(report.claims) ? report.claims : []),
      ...(Array.isArray(report.workerArtifact?.content?.claims) ? report.workerArtifact.content.claims : [])
    ];
    return claims.map((claim) => String(claim?.statement || '')).join('\n')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  } catch {
    return '';
  }
}

function verifySimpleMissionProof(receipt, missionName) {
  if (missionName !== 'orchestrateur-simple') return null;
  const remaining = 24 - 3;
  const groups = 7;
  const perGroup = Math.floor(remaining / groups);
  const remainder = remaining % groups;
  const evidence = evidenceText(receipt);
  const checks = {
    subtraction: new RegExp(`24\\s*[-−]\\s*3\\s*=\\s*${remaining}`).test(evidence),
    division: new RegExp(`${remaining}\\s*(?:÷|/)\\s*${groups}\\s*=\\s*${perGroup}`).test(evidence),
    remainder: new RegExp(`${remaining}\\s*(?:mod(?:ulo)?|%)\\s*${groups}\\s*=\\s*${remainder}`).test(evidence)
  };
  return { verified: Object.values(checks).every(Boolean), expected: { remaining, perGroup, remainder }, checks };
}

module.exports = { verifySimpleMissionProof };
