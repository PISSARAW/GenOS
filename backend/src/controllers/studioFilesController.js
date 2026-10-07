'use strict';
const { getDatabase } = require('../db');
const { findWorkspace } = require('./workspaceControllerFiles');
const files = require('../services/studioFilesService');

async function handle(req, res, operation) {
  try {
    if (!req.tenant) return res.status(403).json({ error: { code: 'TENANT_SCOPE_REQUIRED' } });
    const workspace = await findWorkspace(await getDatabase(), req, req.params.id);
    if (!workspace) return res.status(404).json({ error: { code: 'WORKSPACE_NOT_FOUND' } });
    const result = await operation(workspace);
    res.setHeader('Cache-Control', 'no-store');
    res.json(result);
  } catch (issue) {
    const status = issue.status || (issue.code === 'ENOENT' ? 404 : 400);
    res.status(status).json({ error: { code: issue.code || 'FILE_INVALID', message: issue.message } });
  }
}

const list = (req, res) => handle(req, res, workspace => files.list(workspace));
const read = (req, res) => handle(req, res, workspace => files.read(workspace, req.query.path));
const write = (req, res) => handle(req, res, async workspace => {
  const result = await files.write(workspace, { ...req.body, path: req.query.path });
  require('../services/telemetryObserver').emitEvent({ eventType: 'STUDIO_FILE_SAVED', agentId: req.user?.username,
    action: 'WRITE', detail: result.path, payload: { workspaceId: workspace.id, organizationId: req.tenant.organizationId,
      projectId: req.tenant.projectId, version: result.version } });
  return result;
});
module.exports = { list, read, write };
