/**
 * GenOS Command Palette & God Mode Terminal Controller
 */

const { getDatabase } = require('../db');
const telemetry = require('../services/telemetryObserver');
const circuitBreaker = require('../services/circuitBreaker');
const lineageController = require('./lineageController');
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

function controllerResponse(resolve) {
  return {
    status(code) { this.statusCode = code; return this; },
    json(payload) { resolve({ status: this.statusCode || 200, payload }); }
  };
}

async function handleCommand(req, res) {
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

  switch (action) {
    case 'fork_agent': {
      const parentId = agentId || params?.agentId;
      if (!parentId) return res.status(400).json({ error: { code: 'AGENT_REQUIRED', message: 'agentId is required.' } });
      const result = await new Promise((resolve, reject) => {
        const forkResponse = controllerResponse(resolve);
        Promise.resolve(lineageController.cloneNode({ body: { nodeId: parentId } }, forkResponse)).catch(reject);
      });
      return res.status(result.status).json(result.payload);
    }

    case 'kill_agent': {
      const targetId = agentId || params?.agentId;
      if (!targetId) return res.status(400).json({ error: { code: 'AGENT_REQUIRED', message: 'agentId is required.' } });
      const stopped = stopMission(targetId);
      await updateAgentStatus(db, targetId, 'terminated', 'Terminated by command palette');
      return res.json({ success: true, agentId: targetId, stopped, status: 'terminated' });
    }

    case 'inspect_state': {
      const state = circuitBreaker.getStatus();
      return res.json({ success: true, state });
    }

    case 'reboot_studio': {
      const stoppedMissions = stopAllMissions().length;
      circuitBreaker.resetHalt('studio_reboot');
      telemetry.emitEvent({ eventType: 'STUDIO_REBOOT_REQUESTED', agentId: 'command_palette', action: 'REBOOT', detail: 'Studio restart requested by command palette', severity: 'warning', payload: { stoppedMissions } });
      return res.status(202).json({ success: true, action: 'reboot_studio', stoppedMissions, restartRequired: true, message: 'Managed missions stopped. Restart the backend process through its supervisor.' });
    }

    case 'snapshot_workspace': {
      const targetWorkspaceId = workspaceId || params?.workspaceId;
      const workspace = await findCommandWorkspace(db, req, targetWorkspaceId);
      if (!workspace) return res.status(404).json({ error: { code: 'WORKSPACE_NOT_FOUND', message: `Workspace not found: ${targetWorkspaceId || '<missing>'}` } });
      const snapshot = await snapshotStore.capture({
        db,
        workspace,
        label: params?.label || 'Command palette snapshot',
        reason: params?.reason || 'Manual command palette snapshot',
        author: req.user?.username || 'studio'
      });
      telemetry.emitEvent({ eventType: 'WORKSPACE_SNAPSHOT_CREATED', agentId: req.user?.username || 'studio', action: 'SNAPSHOT', detail: `Command palette captured ${snapshot.id}`, payload: snapshot });
      return res.status(201).json({ success: true, snapshot });
    }

    default:
      return res.status(400).json({ error: { code: 'UNSUPPORTED_COMMAND', message: `Unsupported command action: ${action}` } });
  }
}

async function updateAgentStatus(db, agentId, status, currentTask) {
  await db.run(
    'UPDATE agents SET status = ?, current_task = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    status,
    currentTask,
    agentId
  );
}

async function handleTerminal(req, res) {
  const { command } = req.body || {};
  const cmd = (command || '').trim().toLowerCase();
  const db = await getDatabase();

  let output = '';
  if (cmd === 'help') {
    output = 'GenOS Terminal Available Commands:\n  status   - Show current backend and breaker status\n  halt     - Block new MCP tool invocations through the kill switch\n  resume   - Reset the MCP kill switch\n  agents   - List persisted agents\n  ping     - Show backend health\n  clear    - Clear terminal buffer';
  } else if (cmd === 'status') {
    const cb = circuitBreaker.getStatus();
    const tools = await db.get('SELECT COUNT(*) as count FROM mcp_tools');
    const agents = await db.get("SELECT COUNT(*) as count FROM agents WHERE status = 'running'");
    const systemState = cb.isHalted ? 'HALTED' : 'OK';
    output = `[SYSTEM ${systemState}] MCP Tools: ${tools?.count || 0} | Active Agents: ${agents?.count || 0} | Breaker: ${cb.isHalted ? 'HALTED' : cb.state} | Halted: ${cb.isHalted} | Failures: ${cb.failureCount}`;
  } else if (cmd === 'halt' || cmd === 'abort') {
    circuitBreaker.triggerHalt('Terminal user command', 'terminal_user');
    output = '[HALT ENGAGED] New MCP tool invocations are blocked by the backend kill switch. Existing external runtimes are not terminated by this command.';
  } else if (cmd === 'resume') {
    circuitBreaker.resetHalt('terminal_user');
    output = '[RESUMED] Backend kill switch reset. MCP tool invocations may resume.';
  } else if (cmd === 'agents') {
    const agents = await db.all("SELECT id, name, status FROM agents WHERE status != 'terminated' ORDER BY created_at DESC");
    output = agents.length > 0 ? agents.map((agent) => `${agent.name || agent.id} [${agent.status}]`).join('\n') : 'No persisted agents.';
  } else if (cmd === 'ping') {
    output = `[PONG] Backend online | Uptime: ${Math.floor(process.uptime())}s`;
  } else if (cmd === 'clear') {
    output = '';
  } else {
    return res.status(400).json({ error: { code: 'UNSUPPORTED_COMMAND', message: `Unsupported terminal command: ${command}` } });
  }

  res.json({ output });
}

module.exports = {
  handleCommand,
  handleTerminal
};
