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
      .replace(/\\+(div|mod)\b/g, '$1')
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
  const division = new RegExp(`(?:${remaining}\\s*(?:÷|/|div)\\s*${groups}|\\\\frac\\s*\\{\\s*${remaining}\\s*\\}\\s*\\{\\s*${groups}\\s*\\})\\s*=\\s*${perGroup}`);
  const checks = {
    subtraction: new RegExp(`24\\s*[-−]\\s*3\\s*=\\s*${remaining}`).test(evidence)
      || new RegExp(`24[\\s\\S]{0,120}3[\\s\\S]{0,120}${remaining}`).test(evidence),
    division: division.test(evidence),
    remainder: new RegExp(`${remaining}\\s*(?:mod(?:ulo)?|%)\\s*${groups}\\s*=\\s*${remainder}`).test(evidence)
      || /(?:aucun|pas de|zero|no)\\s+reste/.test(evidence)
  };
  return { verified: Object.values(checks).every(Boolean), expected: { remaining, perGroup, remainder }, checks };
}

module.exports = { verifySimpleMissionProof };
