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

async function buildReport(framework, workspaceId, generatedBy = 'studio', scope = {}) {
  if (!FRAMEWORKS[framework]) throw Object.assign(new Error('Unsupported compliance framework'), { status: 400 });
  const db = await getDatabase();
  const scoped = scope.organizationId && scope.projectId;
  const params = scoped ? [scope.organizationId, scope.projectId] : [];
  const [events, workspaces, snapshots] = await Promise.all([
    db.get(scoped ? 'SELECT COUNT(*) AS count FROM telemetry_events WHERE organization_id = ? AND project_id = ?' : 'SELECT COUNT(*) AS count FROM telemetry_events WHERE organization_id IS NULL AND project_id IS NULL', ...params),
    db.get(scoped ? 'SELECT COUNT(*) AS count FROM workspaces WHERE organization_id = ? AND project_id = ? AND is_archived = 0' : 'SELECT COUNT(*) AS count FROM workspaces WHERE organization_id IS NULL AND project_id IS NULL AND is_archived = 0', ...params),
    db.get(scoped ? 'SELECT COUNT(*) AS count FROM workspace_snapshots s JOIN workspaces w ON w.id = s.workspace_id WHERE w.organization_id = ? AND w.project_id = ?' : 'SELECT COUNT(*) AS count FROM workspace_snapshots s JOIN workspaces w ON w.id = s.workspace_id WHERE w.organization_id IS NULL AND w.project_id IS NULL', ...params)
  ]);
  const evidence = evidenceFor({ events: events.count, workspaces: workspaces.count, snapshots: snapshots.count }, FRAMEWORKS[framework]);
  const score = Math.round((evidence.filter((item) => item.status === 'pass').length / evidence.length) * 100);
  const report = { id: `cmp_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`, framework, title: FRAMEWORKS[framework].title, workspaceId: workspaceId || null, score, evidence, findings: evidence.filter((item) => item.status !== 'pass'), generatedBy };
  await db.run('INSERT INTO compliance_reports (id, framework, workspace_id, organization_id, project_id, score, findings_json, evidence_json, generated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', report.id, framework, workspaceId || null, scope.organizationId || null, scope.projectId || null, score, JSON.stringify(report.findings), JSON.stringify(evidence), generatedBy);
  return report;
}

async function listReports(framework, scope = {}) {
  const db = await getDatabase();
  const conditions = ['organization_id = ?', 'project_id = ?'];
  const params = [scope.organizationId, scope.projectId];
  if (framework) { conditions.push('framework = ?'); params.push(framework); }
  const rows = await db.all(`SELECT * FROM compliance_reports WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`, ...params);
  return rows.map(parseRow);
}

async function getReport(id, scope = {}) {
  const db = await getDatabase();
  const row = await db.get('SELECT * FROM compliance_reports WHERE id = ? AND organization_id = ? AND project_id = ?', id, scope.organizationId, scope.projectId);
  return row ? parseRow(row) : null;
}

function parseRow(row) {
  return { ...row, findings: JSON.parse(row.findings_json || '[]'), evidence: JSON.parse(row.evidence_json || '[]') };
}

function toMarkdown(report) {
  return `# ${report.title} compliance report\n\n- ID: ${report.id}\n- Score: ${report.score}%\n- Generated: ${report.created_at || new Date().toISOString()}\n\n## Evidence\n${report.evidence.map((e) => `- **${e.control}** — ${e.status}: ${e.detail} (${e.source})`).join('\n')}`;
}

module.exports = { FRAMEWORKS, buildReport, listReports, getReport, toMarkdown };
