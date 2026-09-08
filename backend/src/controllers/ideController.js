const crypto = require('crypto');
const path = require('path');
const { getDatabase } = require('../db');

const contractPath = process.env.GENOS_IDE_CONTRACT_PATH
  || path.resolve(__dirname, '../../../integrations/ide/genos-extension-contract.json');
const CONTRACT = require(contractPath);

function parseVersion(value) {
  const match = String(value || '').trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  return match ? match.slice(1).map(Number) : null;
}

function isCompatibleVersion(version) {
  const server = parseVersion(CONTRACT.version);
  const client = parseVersion(version);
  return Boolean(server && client && client[0] === server[0] && client[1] >= server[1]);
}

async function contract(req, res) { res.json(CONTRACT); }
async function connect(req, res) {
  const { ide, workspaceId, version = CONTRACT.version, metadata = {} } = req.body || {};
  if (!CONTRACT.ides.includes(ide)) return res.status(400).json({ error: { code: 'INVALID_IDE', message: 'ide must be vscode, jetbrains or antigravity' } });
  if (!workspaceId) return res.status(400).json({ error: { code: 'WORKSPACE_REQUIRED', message: 'workspaceId is required for an IDE integration.' } });
  if (!isCompatibleVersion(version)) return res.status(426).json({ error: { code: 'INCOMPATIBLE_IDE_VERSION', message: `IDE version '${version}' is incompatible with contract ${CONTRACT.version}.` } });
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return res.status(400).json({ error: { code: 'INVALID_IDE_METADATA', message: 'metadata must be an object.' } });
  const db = await getDatabase();
  const workspace = await db.get(
    'SELECT id FROM workspaces WHERE id = ? AND organization_id = ? AND project_id = ?',
    workspaceId,
    req.tenant.organizationId,
    req.tenant.projectId
  );
  if (!workspace) return res.status(404).json({ error: { code: 'WORKSPACE_NOT_FOUND', message: 'Workspace not found in this project.' } });
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
async function scopedIntegration(req, db) {
  return db.get(
    `SELECT i.* FROM ide_integrations i
     LEFT JOIN workspaces w ON w.id = i.workspace_id
     WHERE i.id = ? AND w.organization_id = ? AND w.project_id = ?`,
    req.params.id,
    req.tenant.organizationId,
    req.tenant.projectId
  );
}
async function heartbeat(req, res) {
  const db = await getDatabase();
  const integration = await scopedIntegration(req, db);
  if (!integration) return res.status(404).json({ error: { code: 'IDE_INTEGRATION_NOT_FOUND', message: 'IDE integration not found in this project.' } });
  await db.run('UPDATE ide_integrations SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?', integration.id);
  res.json({ id: integration.id, status: 'connected', lastSeenAt: new Date().toISOString() });
}
async function status(req, res) {
  const db = await getDatabase();
  const integration = await scopedIntegration(req, db);
  if (!integration) return res.status(404).json({ error: { code: 'IDE_INTEGRATION_NOT_FOUND', message: 'IDE integration not found in this project.' } });
  res.json({ id: integration.id, ide: integration.ide, version: integration.version, status: integration.status, lastSeenAt: integration.last_seen_at, workspaceId: integration.workspace_id });
}
async function disconnect(req, res) {
  const db = await getDatabase();
  const integration = await scopedIntegration(req, db);
  if (!integration) return res.status(404).json({ error: { code: 'IDE_INTEGRATION_NOT_FOUND', message: 'IDE integration not found in this project.' } });
  await db.run('UPDATE ide_integrations SET status = \'revoked\', last_seen_at = CURRENT_TIMESTAMP WHERE id = ?', integration.id);
  res.json({ id: integration.id, status: 'revoked' });
}
async function execute(req, res) {
  const command = CONTRACT.commands.find((item) => item.id === req.params.command);
  if (!command) return res.status(404).json({ error: { code: 'IDE_COMMAND_NOT_FOUND', message: 'Unknown GenOS IDE command' } });
  if (command.id === 'compliance.generate') return res.json({ accepted: true, action: 'open-studio', endpoint: '/api/compliance/reports' });
  return res.status(501).json({ error: { code: 'IDE_COMMAND_NOT_IMPLEMENTED', message: `IDE command '${command.id}' is registered but has no execution handler.` }, action: command.id });
}
module.exports = { contract, connect, list, heartbeat, status, disconnect, execute, isCompatibleVersion };
