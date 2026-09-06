const crypto = require('crypto');
const path = require('path');
const { getDatabase } = require('../db');

const contractPath = process.env.GENOS_IDE_CONTRACT_PATH
  || path.resolve(__dirname, '../../../integrations/ide/genos-extension-contract.json');
const CONTRACT = require(contractPath);

async function contract(req, res) { res.json(CONTRACT); }
async function connect(req, res) {
  const { ide, workspaceId, version = CONTRACT.version, metadata = {} } = req.body || {};
  if (!CONTRACT.ides.includes(ide)) return res.status(400).json({ error: { message: 'ide must be vscode, jetbrains or antigravity' } });
  const db = await getDatabase();
  if (workspaceId) {
    const workspace = await db.get(
      'SELECT id FROM workspaces WHERE id = ? AND organization_id = ? AND project_id = ?',
      workspaceId,
      req.tenant.organizationId,
      req.tenant.projectId
    );
    if (!workspace) return res.status(404).json({ error: { code: 'WORKSPACE_NOT_FOUND', message: 'Workspace not found in this project.' } });
  }
  const id = `ide_${crypto.randomBytes(8).toString('hex')}`;
  await db.run('INSERT INTO ide_integrations (id, ide, workspace_id, version, metadata_json) VALUES (?, ?, ?, ?, ?)', id, ide, workspaceId || null, version, JSON.stringify(metadata));
  res.status(201).json({ id, ide, workspaceId: workspaceId || null, version, status: 'connected', commands: CONTRACT.commands });
}
async function list(req, res) {
  const db = await getDatabase();
  const rows = await db.all(
    `SELECT i.* FROM ide_integrations i
     LEFT JOIN workspaces w ON w.id = i.workspace_id
     WHERE i.status = 'connected'
       AND ((i.workspace_id IS NULL AND ? IS NULL AND ? IS NULL)
         OR (w.organization_id = ? AND w.project_id = ?))
     ORDER BY i.last_seen_at DESC`,
    req.tenant?.organizationId || null,
    req.tenant?.projectId || null,
    req.tenant?.organizationId || null,
    req.tenant?.projectId || null
  );
  res.json(rows.map((row) => ({ ...row, metadata: JSON.parse(row.metadata_json || '{}') })));
}
async function execute(req, res) {
  const command = CONTRACT.commands.find((item) => item.id === req.params.command);
  if (!command) return res.status(404).json({ error: { message: 'Unknown GenOS IDE command' } });
  if (command.id === 'compliance.generate') return res.json({ accepted: true, action: 'open-studio', endpoint: '/api/compliance/reports' });
  res.json({ accepted: true, action: command.id, payload: req.body || {} });
}
module.exports = { contract, connect, list, execute };
