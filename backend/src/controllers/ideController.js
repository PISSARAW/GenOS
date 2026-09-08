const crypto = require('crypto');
const path = require('path');
const { getDatabase } = require('../db');
const telemetry = require('../services/telemetryObserver');

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
  const requestedLimit = Number.parseInt(req.query?.limit, 10);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50;
  const rows = await db.all(
    `SELECT i.* FROM ide_integrations i
     LEFT JOIN workspaces w ON w.id = i.workspace_id
     WHERE i.status = 'connected'
       AND w.organization_id = ? AND w.project_id = ?
    ORDER BY i.last_seen_at DESC LIMIT ?`,
    req.tenant?.organizationId || null,
    req.tenant?.projectId || null,
    limit
  );
  res.json(rows.map((row) => {
    let metadata = {};
    try { metadata = JSON.parse(row.metadata_json || '{}'); } catch (_) {}
    return { ...row, metadata };
  }));
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
async function diagnostics(req, res) {
  const db = await getDatabase();
  const integration = await scopedIntegration(req, db);
  if (!integration) return res.status(404).json({ error: { code: 'IDE_INTEGRATION_NOT_FOUND', message: 'IDE integration not found in this project.' } });
  const lastSeenMs = Date.parse(integration.last_seen_at || '');
  const ageMs = Number.isFinite(lastSeenMs) ? Math.max(0, Date.now() - lastSeenMs) : null;
  res.json({
    id: integration.id,
    ide: integration.ide,
    version: integration.version,
    contractVersion: CONTRACT.version,
    compatible: isCompatibleVersion(integration.version),
    status: integration.status,
    lastSeenAt: integration.last_seen_at,
    heartbeatAgeMs: ageMs,
    stale: ageMs === null || ageMs > 5 * 60 * 1000,
    capabilities: CONTRACT.capabilities || []
  });
}
async function disconnect(req, res) {
  const db = await getDatabase();
  const integration = await scopedIntegration(req, db);
  if (!integration) return res.status(404).json({ error: { code: 'IDE_INTEGRATION_NOT_FOUND', message: 'IDE integration not found in this project.' } });
  await db.run('UPDATE ide_integrations SET status = \'revoked\', last_seen_at = CURRENT_TIMESTAMP WHERE id = ?', integration.id);
  res.json({ id: integration.id, status: 'revoked' });
}
async function progress(req, res) {
  const db = await getDatabase();
  const integration = await scopedIntegration(req, db);
  if (!integration || integration.status !== 'connected') return res.status(404).json({ error: { code: 'IDE_INTEGRATION_NOT_FOUND', message: 'Connected IDE integration not found in this project.' } });
  const progressPercent = Number(req.body?.progressPercent);
  if (!Number.isFinite(progressPercent) || progressPercent < 0 || progressPercent > 100) return res.status(400).json({ error: { code: 'INVALID_PROGRESS', message: 'progressPercent must be a number between 0 and 100.' } });
  const message = String(req.body?.message || '').trim();
  if (!message) return res.status(400).json({ error: { code: 'PROGRESS_MESSAGE_REQUIRED', message: 'message is required.' } });
  const event = telemetry.emitEvent({
    eventType: 'IDE_PROGRESS',
    agentId: integration.id,
    action: String(req.body?.phase || 'working').toUpperCase(),
    detail: message,
    severity: 'info',
    payload: { integrationId: integration.id, workspaceId: integration.workspace_id, progressPercent, phase: req.body?.phase || 'working', organizationId: req.tenant.organizationId, projectId: req.tenant.projectId }
  });
  await db.run('UPDATE ide_integrations SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?', integration.id);
  res.status(202).json({ accepted: true, event });
}
async function execute(req, res) {
  const db = await getDatabase();
  const integration = await scopedIntegration({ ...req, params: { id: req.body?.integrationId } }, db);
  if (!integration || integration.status !== 'connected') return res.status(404).json({ error: { code: 'IDE_INTEGRATION_NOT_FOUND', message: 'A connected integrationId in this project is required.' } });
  const command = CONTRACT.commands.find((item) => item.id === req.params.command);
  if (!command) return res.status(404).json({ error: { code: 'IDE_COMMAND_NOT_FOUND', message: 'Unknown GenOS IDE command' } });
  await db.run('UPDATE ide_integrations SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?', integration.id);
  if (command.id === 'compliance.generate') return res.json({ accepted: true, action: 'open-studio', endpoint: '/api/compliance/reports' });
  return res.status(501).json({ error: { code: 'IDE_COMMAND_NOT_IMPLEMENTED', message: `IDE command '${command.id}' is registered but has no execution handler.` }, action: command.id });
}
module.exports = { contract, connect, list, heartbeat, status, diagnostics, disconnect, progress, execute, isCompatibleVersion };
