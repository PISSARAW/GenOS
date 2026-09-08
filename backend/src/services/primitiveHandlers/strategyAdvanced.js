const crypto = require('node:crypto');

function reportsFrom(context = {}) {
  const reports = context.reports || context.independentReports || context.independent_reports;
  return Array.isArray(reports) ? reports.filter((report) => report && typeof report === 'object') : [];
}

function evidenceCount(report = {}) {
  const evidence = report.evidence || report.receipts || report.findings || [];
  return Array.isArray(evidence) ? evidence.filter(Boolean).length : 0;
}

async function independentReports(context = {}) {
  const reports = reportsFrom(context);
  if (!reports.length) return { success: false, error: 'At least two independent reports are required.', code: 'REPORTS_REQUIRED' };
  const normalized = reports.map((report, index) => ({
    id: String(report.id || `report-${index + 1}`),
    author: String(report.author || report.agentId || `reviewer-${index + 1}`),
    conclusion: String(report.conclusion || report.verdict || '').trim(),
    evidenceCount: evidenceCount(report),
    claims: Array.isArray(report.claims) ? report.claims : []
  }));
  const authors = new Set(normalized.map((report) => report.author));
  if (authors.size < 2) return { success: false, error: 'Reports must come from at least two independent authors.', code: 'REPORTS_NOT_INDEPENDENT' };
  return { success: true, independent: true, reports: normalized, reportCount: normalized.length, authorCount: authors.size };
}

async function neutralObserver(context = {}) {
  const reports = reportsFrom(context);
  if (!reports.length) return { success: false, error: 'Reports are required for neutral observation.', code: 'REPORTS_REQUIRED' };
  const scored = reports.map((report, index) => ({
    id: String(report.id || `report-${index + 1}`),
    author: String(report.author || report.agentId || `reviewer-${index + 1}`),
    verdict: String(report.verdict || report.conclusion || 'undetermined').trim(),
    evidenceCount: evidenceCount(report),
    supported: evidenceCount(report) > 0
  }));
  const supported = scored.filter((report) => report.supported);
  const verdicts = new Map();
  for (const report of supported) verdicts.set(report.verdict, (verdicts.get(report.verdict) || 0) + 1);
  const consensus = [...verdicts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0] || null;
  return {
    success: true,
    neutral: true,
    verdict: consensus && consensus[1] >= Math.ceil(supported.length / 2) ? consensus[0] : 'contested',
    confidence: supported.length ? Number(((consensus?.[1] || 0) / supported.length).toFixed(4)) : 0,
    supportedReports: supported.length,
    unsupportedReports: scored.length - supported.length,
    reports: scored
  };
}

async function synthesizeReports(context = {}) {
  const observation = await neutralObserver(context);
  if (!observation.success) return observation;
  const reports = reportsFrom(context);
  const claims = [...new Map(reports.flatMap((report) => (Array.isArray(report.claims) ? report.claims : [])).map((claim, index) => [JSON.stringify(claim), claim])).values()];
  return {
    success: true,
    synthesisId: `synthesis-${crypto.createHash('sha256').update(JSON.stringify({ verdict: observation.verdict, claims })).digest('hex').slice(0, 16)}`,
    verdict: observation.verdict,
    confidence: observation.confidence,
    claims,
    evidenceComplete: observation.unsupportedReports === 0,
    observer: observation
  };
}

async function securityCoevolution(context = {}) {
  const red = reportsFrom({ reports: context.redTeam || context.red_team || [] });
  const blue = reportsFrom({ reports: context.blueTeam || context.blue_team || [] });
  if (!red.length || !blue.length) return { success: false, error: 'redTeam and blueTeam reports are required.', code: 'RED_BLUE_REPORTS_REQUIRED' };
  const redFindings = new Set(red.flatMap((report) => report.findings || report.claims || []).map((finding) => JSON.stringify(finding)));
  const blueAddresses = new Set(blue.flatMap((report) => report.addressedFindings || report.mitigations || []).map((finding) => JSON.stringify(finding)));
  const unresolved = [...redFindings].filter((finding) => !blueAddresses.has(finding)).map((finding) => JSON.parse(finding));
  return {
    success: true,
    resolved: unresolved.length === 0,
    unresolvedFindings: unresolved,
    redReports: red.length,
    blueReports: blue.length,
    redEvidence: red.reduce((sum, report) => sum + evidenceCount(report), 0),
    blueEvidence: blue.reduce((sum, report) => sum + evidenceCount(report), 0)
  };
}

module.exports = { independentReports, neutralObserver, synthesizeReports, securityCoevolution };
