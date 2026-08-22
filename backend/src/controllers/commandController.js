/**
 * GenOS Command Palette & God Mode Terminal Controller
 */

const { getDatabase } = require('../db');
const telemetry = require('../services/telemetryObserver');
const circuitBreaker = require('../services/circuitBreaker');

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
      return res.status(501).json({ error: { code: 'UNAVAILABLE', message: 'Command-palette agent forking is unavailable. Use a scoped Agent Profile clone instead.' } });
    }

    case 'kill_agent': {
      return res.status(501).json({ error: { code: 'UNAVAILABLE', message: 'Command-palette agent termination is unavailable because it cannot stop a runtime process safely.' } });
    }

    case 'inspect_state': {
      const state = circuitBreaker.getStatus();
      return res.json({ success: true, state });
    }

    case 'reboot_studio': {
      return res.status(501).json({ error: { code: 'UNAVAILABLE', message: 'Studio reboot is not implemented by the backend.' } });
    }

    case 'snapshot_workspace': {
      return res.status(501).json({ error: { code: 'UNAVAILABLE', message: 'Command-palette snapshots are unavailable because this command cannot capture workspace state. Use the Workspace Timeline snapshot flow.' } });
    }

    default:
      return res.status(400).json({ error: { code: 'UNSUPPORTED_COMMAND', message: `Unsupported command action: ${action}` } });
  }
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
    output = `[SYSTEM] MCP Tools: ${tools?.count || 0} | Active Agents: ${agents?.count || 0} | Breaker: ${cb.isHalted ? 'HALTED' : cb.state} | Halted: ${cb.isHalted} | Failures: ${cb.failureCount}`;
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
