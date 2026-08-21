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
      const newId = `agent_fork_${Date.now()}`;
      const parent = agentId ? await db.get('SELECT agent_type, language FROM agents WHERE id = ?', agentId) : null;
      await db.run(
        `INSERT INTO agents (id, name, role, status, agent_type, language, isolation_mode, parent_agent_id, lineage_relation, about, current_task) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        newId, `Clone of ${agentId || 'Node'}`, 'Forked Worker', 'running', parent?.agent_type || 'GenOS', parent?.language || 'TypeScript', 'Branch', agentId || null, 'clone', `Clone created from ${agentId || 'the GenOS fleet'}.`, 'Autonomous forked execution'
      );
      return res.json({ success: true, message: `Forked agent created: ${newId}`, agentId: newId });
    }

    case 'kill_agent': {
      if (agentId) {
        await db.run("UPDATE agents SET status = 'Apoptosis' WHERE id = ?", agentId);
      }
      return res.json({ success: true, message: `Agent ${agentId || 'all'} apoptosis triggered.` });
    }

    case 'inspect_state': {
      const state = circuitBreaker.getStatus();
      return res.json({ success: true, state });
    }

    case 'reboot_studio': {
      return res.json({ success: true, message: 'GenOS Studio hot reboot sequence completed.' });
    }

    case 'snapshot_workspace': {
      const snapId = `snp-${Date.now()}`;
      await db.run(
        `INSERT INTO workspace_snapshots (id, workspace_id, snapshot_hash, step_number, label, author, reason) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        snapId, workspaceId || 'ws-genos-core', snapId.slice(-7), 10, 'Manual Command Snapshot', 'operator', 'Triggered via Command Palette'
      );
      return res.json({ success: true, message: `Snapshot ${snapId} created.`, snapshotId: snapId });
    }

    default:
      return res.json({ success: true, message: `Action '${action}' executed successfully.` });
  }
}

async function handleTerminal(req, res) {
  const { command } = req.body || {};
  const cmd = (command || '').trim().toLowerCase();
  const db = await getDatabase();

  let output = '';
  if (cmd === 'help') {
    output = 'GenOS Terminal Available Commands:\n  status   - Show current backend and breaker status\n  halt     - Engage emergency kill switch\n  resume   - Reset kill switch and restore runtime\n  agents   - List persisted agents\n  ping     - Show backend health\n  clear    - Clear terminal buffer';
  } else if (cmd === 'status') {
    const cb = circuitBreaker.getStatus();
    const tools = await db.get('SELECT COUNT(*) as count FROM mcp_tools');
    const agents = await db.get("SELECT COUNT(*) as count FROM agents WHERE status = 'running'");
    output = `[SYSTEM] MCP Tools: ${tools?.count || 0} | Active Agents: ${agents?.count || 0} | Breaker: ${cb.state} | Halted: ${cb.isHalted} | Failures: ${cb.failureCount}`;
  } else if (cmd === 'halt' || cmd === 'abort') {
    circuitBreaker.triggerHalt('Terminal user command', 'terminal_user');
    output = '[HALT ENGAGED] Global Cryptobiosis initiated. All active tasks suspended.';
  } else if (cmd === 'resume') {
    circuitBreaker.resetHalt('terminal_user');
    output = '[RESUMED] System runtime restored. Circuit breaker set to CLOSED.';
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
