const compliance = require('../services/complianceService');

async function listFrameworks(req, res) {
  res.json(Object.entries(compliance.FRAMEWORKS).map(([id, value]) => ({ id, ...value })));
}

async function listReports(req, res) { res.json(await compliance.listReports(req.query.framework)); }
async function createReport(req, res) {
  const report = await compliance.buildReport(req.body.framework, req.body.workspaceId, req.user?.username || 'studio');
  res.status(201).json(report);
}
async function getReport(req, res) {
  const report = await compliance.getReport(req.params.id);
  if (!report) return res.status(404).json({ error: { message: 'Compliance report not found' } });
  res.json(report);
}
async function exportReport(req, res) {
  const report = await compliance.getReport(req.params.id);
  if (!report) return res.status(404).json({ error: { message: 'Compliance report not found' } });
  const format = req.query.format || 'json';
  if (format === 'markdown' || format === 'md') {
    res.type('text/markdown').set('Content-Disposition', `attachment; filename="${report.id}.md"`).send(compliance.toMarkdown(report));
  } else if (format === 'csv') {
    const csv = ['control,status,source,detail', ...report.evidence.map((e) => [e.control, e.status, e.source, e.detail].map((v) => `"${String(v).replaceAll('"', '""')}"`).join(','))].join('\n');
    res.type('text/csv').set('Content-Disposition', `attachment; filename="${report.id}.csv"`).send(csv);
  } else res.type('application/json').set('Content-Disposition', `attachment; filename="${report.id}.json"`).send(JSON.stringify(report, null, 2));
}

module.exports = { listFrameworks, listReports, createReport, getReport, exportReport };
