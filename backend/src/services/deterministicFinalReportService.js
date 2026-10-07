'use strict';

const crypto = require('node:crypto');

function reportsOf(dossier) {
  return (dossier.events || []).map((event) => event.evidenceReport || event.payload?.evidenceReport)
    .filter((report) => report && typeof report === 'object');
}

function dossierPosition(dossier) {
  const workerId = dossier.workerId || dossier.agentId;
  if (!workerId) throw new TypeError('Source dossier identity required.');
  const reports = reportsOf(dossier);
  const claims = reports.flatMap((report) => (report.claims || []).map((claim) => ({
    statement: String(claim.statement || ''), evidence: [...(claim.evidence || [])],
    workerId, declaredOutcome: report.outcome || 'unknown'
  })));
  return { workerId, claims, outcomes: reports.map((report) => report.outcome || 'unknown') };
}

function contradictions(positions) {
  const grouped = new Map();
  for (const claim of positions.flatMap((position) => position.claims)) {
    const key = claim.statement.trim();
    grouped.set(key, [...(grouped.get(key) || []), claim]);
  }
  return [...grouped].filter(([, claims]) => new Set(claims.map((claim) => claim.declaredOutcome)).size > 1)
    .map(([statement, claims]) => ({ statement, workerIds: claims.map((claim) => claim.workerId) }));
}

function compile(plan) {
  if (plan?.synthesisOnly !== true) return null;
  const dossiers = plan.completedWorkerDossiers || [];
  const positions = dossiers.map(dossierPosition);
  const expected = plan.completedWorkerIds || [];
  const actual = positions.map((position) => position.workerId);
  validateDossierSet(expected, actual);
  const conflicts = contradictions(positions);
  const claims = positions.flatMap((position) => position.claims);
  const uncertain = claims.filter((claim) => claim.declaredOutcome !== 'success' || !claim.evidence.length);
  const omissions = positions.filter((position) => !position.claims.length).map((position) => position.workerId);
  const report = { schema: 'genos.canonical-final-report/v1',
    outcome: uncertain.length || conflicts.length || omissions.length ? 'failed' : 'success',
    assemblyStatus: 'assembled', claims, contradictions: conflicts, omissions,
    unverifiedClaims: uncertain.map((claim) => claim.statement),
    dossierInfluence: positions.map((position) => ({ workerId: position.workerId,
      influence: 'Déclarations conservées et attribuées sans arbitrage narratif.',
      usedClaims: position.claims.map((claim) => claim.statement) })),
    artifactText: claims.map((claim) => '[' + claim.workerId + ' / déclaré ' + claim.declaredOutcome + '] ' + claim.statement).join('\n'),
    limitation: 'Assembly of attributed reports is not independent verification of their claims.', promotionAllowed: false };
  return { ...report, receiptHash: crypto.createHash('sha256').update(JSON.stringify(report)).digest('hex') };
}

function validateDossierSet(expected, actual) {
  if (!expected.length || new Set(actual).size !== actual.length
    || expected.length !== actual.length || expected.some((id) => !actual.includes(id))) {
    throw Object.assign(new Error('Canonical report requires every expected dossier exactly once.'), { code: 'CANONICAL_DOSSIER_MISSING' });
  }
}

module.exports = { compile };
