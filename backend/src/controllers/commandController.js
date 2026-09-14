/**
 * GenOS Command Palette & God Mode Terminal Controller
 */

const { getDatabase } = require('../db');
const telemetry = require('../services/telemetryObserver');
const circuitBreaker = require('../services/circuitBreaker');
const lineageController = require('./lineage');
const snapshotStore = require('../services/workspaceSnapshotStore');
const { stopMission, stopAllMissions } = require('../services/agentRuntimeAdapter');

async function findCommandWorkspace(db, req, workspaceId) {
  if (!workspaceId) return null;
  if (req.tenant) {
    return db.get(
      'SELECT * FROM workspaces WHERE id = ? AND organization_id = ? AND project_id = ?',
      workspaceId,
      req.tenant.organizationId,
      req.tenant.projectId
    );
  }
  return db.get('SELECT * FROM workspaces WHERE id = ? AND organization_id IS NULL AND project_id IS NULL', workspaceId);
}

async function findCommandAgent(db, req, agentId) {
  if (req.tenant) {
    return db.get(
      'SELECT a.* FROM agents a JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ? AND w.organization_id = ? AND w.project_id = ?',
      agentId,
      req.tenant.organizationId,
      req.tenant.projectId
    );
  }
  return db.get('SELECT * FROM agents WHERE id = ? AND workspace_id IN (SELECT id FROM workspaces WHERE organization_id IS NULL AND project_id IS NULL)', agentId);
}

function controllerResponse(resolve) {
  return {
    status(code) { this.statusCode = code; return this; },
    json(payload) { resolve({ status: this.statusCode || 200, payload }); }
  };
}

function hasConfirmation(req) {
  return req.body?.confirmed === true;
}

async function handleForkAgent(ctx) {
  const { res, db, req, agentId, params } = ctx;
  const parentId = agentId || params?.agentId;
  if (!parentId) return res.status(400).json({ error: { code: 'AGENT_REQUIRED', message: 'agentId is required.' } });
  if (!await findCommandAgent(db, req, parentId)) return res.status(404).json({ error: { code: 'AGENT_NOT_FOUND', message: `Agent '${parentId}' is not available in this project.` } });
  const result = await new Promise((resolve, reject) => {
    const forkResponse = controllerResponse(resolve);
    Promise.resolve(lineageController.cloneNode({ body: { nodeId: parentId } }, forkResponse)).catch(reject);
  });
  return res.status(result.status).json(result.payload);
}

async function handleKillAgent(ctx) {
  const { res, db, req, agentId, params } = ctx;
  if (!hasConfirmation(req)) return res.status(409).json({ error: { code: 'CONFIRMATION_REQUIRED', message: 'Killing an agent requires confirmed: true.' } });
  const targetId = agentId || params?.agentId;
  if (!targetId) return res.status(400).json({ error: { code: 'AGENT_REQUIRED', message: 'agentId is required.' } });
  const targetAgent = await findCommandAgent(db, req, targetId);
  if (!targetAgent) return res.status(404).json({ error: { code: 'AGENT_NOT_FOUND', message: `Agent '${targetId}' is not available in this project.` } });
  const stopped = stopMission(targetId);
  await updateAgentStatus(db, { agentId: targetId, status: 'terminated', currentTask: 'Terminated by command palette', req });
  return res.json({ success: true, agentId: targetId, stopped, status: 'terminated' });
}

function handleInspectState(ctx) {
  const state = circuitBreaker.getStatus();
  return ctx.res.json({ success: true, state });
}

function handleRebootStudio(ctx) {
  const { res, req } = ctx;
  if (!hasConfirmation(req)) return res.status(409).json({ error: { code: 'CONFIRMATION_REQUIRED', message: 'Rebooting Studio requires confirmed: true.' } });
  const stoppedMissions = stopAllMissions().length;
  circuitBreaker.resetHalt('studio_reboot');
  telemetry.emitEvent({ eventType: 'STUDIO_REBOOT_REQUESTED', agentId: 'command_palette', action: 'REBOOT', detail: 'Studio restart requested by command palette', severity: 'warning', payload: { stoppedMissions } });
  return res.status(202).json({ success: true, action: 'reboot_studio', stoppedMissions, restartRequired: true, message: 'Managed missions stopped. Restart the backend process through its supervisor.' });
}

function snapshotMetadata(params, req) {
  return {
    label: params?.label || 'Command palette snapshot',
    reason: params?.reason || 'Manual command palette snapshot',
    author: req.user?.username || 'studio'
  };
}

async function handleSnapshotWorkspace(ctx) {
  const { res, db, req, workspaceId, params } = ctx;
  const targetWorkspaceId = workspaceId || params?.workspaceId;
  const workspace = await findCommandWorkspace(db, req, targetWorkspaceId);
  if (!workspace) return res.status(404).json({ error: { code: 'WORKSPACE_NOT_FOUND', message: `Workspace not found: ${targetWorkspaceId || '<missing>'}` } });
  const metadata = snapshotMetadata(params, req);
  const snapshot = await snapshotStore.capture({ db, workspace, ...metadata });
  telemetry.emitEvent({ eventType: 'WORKSPACE_SNAPSHOT_CREATED', agentId: metadata.author, action: 'SNAPSHOT', detail: `Command palette captured ${snapshot.id}`, payload: snapshot });
  return res.status(201).json({ success: true, snapshot });
}

const COMMAND_HANDLERS = new Map([
  ['fork_agent', handleForkAgent],
  ['kill_agent', handleKillAgent],
  ['inspect_state', handleInspectState],
  ['reboot_studio', handleRebootStudio],
  ['snapshot_workspace', handleSnapshotWorkspace]
]);

async function handleCommand(req, res, next) {
  try {
    const { action, agentId, workspaceId, params } = req.body || {};
    const db = await getDatabase();

    telemetry.emitEvent({
      eventType: 'COMMAND_DISPATCHED',
      agentId: agentId || 'command_palette',
      action: action || 'UNKNOWN',
      detail: `Command Palette executed: ${action}`,
      severity: 'info',
      payload: { action, params }
    });

    const handler = COMMAND_HANDLERS.get(action);
    if (!handler) {
      return res.status(400).json({ error: { code: 'UNSUPPORTED_COMMAND', message: `Unsupported command action: ${action}` } });
    }
    return await handler({ req, res, db, action, agentId, workspaceId, params });
  } catch (error) {
    next(error);
  }
}

async function updateAgentStatus(db, options) {
  const { agentId, status, currentTask, req } = options;
  const scope = req?.tenant
    ? { clause: 'AND workspace_id IN (SELECT id FROM workspaces WHERE organization_id = ? AND project_id = ?)', params: [req.tenant.organizationId, req.tenant.projectId] }
    : { clause: 'AND workspace_id IN (SELECT id FROM workspaces WHERE organization_id IS NULL AND project_id IS NULL)', params: [] };
  await db.run(
    `UPDATE agents SET status = ?, current_task = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? ${scope.clause}`,
    status,
    currentTask,
    agentId,
    ...scope.params
  );
}

function terminalHelpOutput() {
  return 'GenOS Terminal Available Commands:\n  status   - Show current backend and breaker status\n  halt     - Block new MCP tool invocations through the kill switch\n  resume   - Reset the MCP kill switch\n  agents   - List persisted agents\n  ping     - Show backend health\n  clear    - Clear terminal buffer';
}

async function terminalStatusOutput(db) {
  const cb = circuitBreaker.getStatus();
  const tools = await db.get('SELECT COUNT(*) as count FROM mcp_tools');
  const agents = await db.get("SELECT COUNT(*) as count FROM agents WHERE status = 'running'");
  const systemState = cb.isHalted ? 'HALTED' : 'OK';
  return `[SYSTEM ${systemState}] MCP Tools: ${tools?.count || 0} | Active Agents: ${agents?.count || 0} | Breaker: ${cb.isHalted ? 'HALTED' : cb.state} | Halted: ${cb.isHalted} | Failures: ${cb.failureCount}`;
}

function terminalHaltOutput() {
  circuitBreaker.triggerHalt('Terminal user command', 'terminal_user');
  return '[HALT ENGAGED] New MCP tool invocations are blocked by the backend kill switch. Existing external runtimes are not terminated by this command.';
}

function terminalResumeOutput() {
  circuitBreaker.resetHalt('terminal_user');
  return '[RESUMED] Backend kill switch reset. MCP tool invocations may resume.';
}

async function terminalAgentsOutput(db) {
  const agents = await db.all("SELECT id, name, status FROM agents WHERE status != 'terminated' ORDER BY created_at DESC");
  return agents.length > 0 ? agents.map((agent) => `${agent.name || agent.id} [${agent.status}]`).join('\n') : 'No persisted agents.';
}

function terminalPingOutput() {
  return `[PONG] Backend online | Uptime: ${Math.floor(process.uptime())}s`;
}

function terminalClearOutput() {
  return '';
}

const TERMINAL_COMMANDS = new Map([
  ['help', terminalHelpOutput],
  ['status', terminalStatusOutput],
  ['halt', terminalHaltOutput],
  ['abort', terminalHaltOutput],
  ['resume', terminalResumeOutput],
  ['agents', terminalAgentsOutput],
  ['ping', terminalPingOutput],
  ['clear', terminalClearOutput]
]);

async function handleTerminal(req, res, next) {
  try {
    const { command } = req.body || {};
    const cmd = (command || '').trim().toLowerCase();
    const db = await getDatabase();

    const handler = TERMINAL_COMMANDS.get(cmd);
    if (!handler) {
      return res.status(400).json({ error: { code: 'UNSUPPORTED_COMMAND', message: `Unsupported terminal command: ${command}` } });
    }
    res.json({ output: await handler(db) });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  handleCommand,
  handleTerminal
};
