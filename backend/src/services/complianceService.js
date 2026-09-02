const crypto = require('crypto');
const { getDatabase } = require('../db');

const FRAMEWORKS = {
  EU_AI_ACT: { title: 'EU AI Act', controls: ['risk_management', 'data_governance', 'technical_documentation', 'human_oversight', 'logging', 'accuracy_security'] },
  SOC_2: { title: 'SOC 2', controls: ['security', 'availability', 'processing_integrity', 'confidentiality', 'privacy'] },
  HIPAA: { title: 'HIPAA', controls: ['access_control', 'audit_controls', 'integrity', 'authentication', 'transmission_security'] }
};

function evidenceFor(row, framework) {
  return [
    { control: framework.controls[0], status: 'pass', source: 'telemetry_events', detail: `${row.events} events retained` },
    { control: framework.controls[1], status: row.workspaces > 0 ? 'pass' : 'review', source: 'workspaces', detail: `${row.workspaces} workspaces registered` },
    { control: framework.controls[2], status: row.snapshots > 0 ? 'pass' : 'review', source: 'workspace_snapshots', detail: `${row.snapshots} snapshots available` }
  ];
}

async function buildReport(framework, workspaceId, generatedBy = 'studio') {
  if (!FRAMEWORKS[framework]) throw Object.assign(new Error('Unsupported compliance framework'), { status: 400 });
  const db = await getDatabase();
  const [events, workspaces, snapshots] = await Promise.all([
    db.get('SELECT COUNT(*) AS count FROM telemetry_events'),
    db.get('SELECT COUNT(*) AS count FROM workspaces WHERE is_archived = 0'),
    db.get('SELECT COUNT(*) AS count FROM workspace_snapshots')
  ]);
  const evidence = evidenceFor({ events: events.count, workspaces: workspaces.count, snapshots: snapshots.count }, FRAMEWORKS[framework]);
  const score = Math.round((evidence.filter((item) => item.status === 'pass').length / evidence.length) * 100);
  const report = { id: `cmp_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`, framework, title: FRAMEWORKS[framework].title, workspaceId: workspaceId || null, score, evidence, findings: evidence.filter((item) => item.status !== 'pass'), generatedBy };
  await db.run('INSERT INTO compliance_reports (id, framework, workspace_id, score, findings_json, evidence_json, generated_by) VALUES (?, ?, ?, ?, ?, ?, ?)', report.id, framework, workspaceId || null, score, JSON.stringify(report.findings), JSON.stringify(evidence), generatedBy);
  return report;
}

async function listReports(framework) {
  const db = await getDatabase();
  const rows = await db.all(`SELECT * FROM compliance_reports ${framework ? 'WHERE framework = ?' : ''} ORDER BY created_at DESC`, ...(framework ? [framework] : []));
  return rows.map(parseRow);
}

async function getReport(id) {
  const db = await getDatabase();
  const row = await db.get('SELECT * FROM compliance_reports WHERE id = ?', id);
  return row ? parseRow(row) : null;
}

function parseRow(row) {
  return { ...row, findings: JSON.parse(row.findings_json || '[]'), evidence: JSON.parse(row.evidence_json || '[]') };
}

function toMarkdown(report) {
  return `# ${report.title} compliance report\n\n- ID: ${report.id}\n- Score: ${report.score}%\n- Generated: ${report.created_at || new Date().toISOString()}\n\n## Evidence\n${report.evidence.map((e) => `- **${e.control}** — ${e.status}: ${e.detail} (${e.source})`).join('\n')}`;
}

module.exports = { FRAMEWORKS, buildReport, listReports, getReport, toMarkdown };
