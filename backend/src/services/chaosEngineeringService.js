/**
 * Chaos Engineering Service for GenOS Metapopulation & Biocénose runtimes.
 * Injects controlled failures (terminating random worker PIDs) to verify
 * that the Regeneration Steward reads the lineage (L_i) and recovers the
 * population without corrupting active orchestrator missions.
 */

const { getDatabase } = require('../db');
const { activeProcesses, emit, TERMINAL_AGENT_STATUSES } = require('./agentOrchestrationState');
const { terminateChild, terminatePid } = require('./processTermination');

async function findEligibleWorkers(db, filter = {}) {
  // Never offer an already-terminal worker as a chaos target: it has no live
  // process and killing it would be a no-op reported as success.
  const terminal = [...TERMINAL_AGENT_STATUSES];
  const terminalPlaceholders = terminal.map(() => '?').join(', ');
  const params = [...terminal];
  let query = `SELECT id, name, role, status, execution_mode, parent_agent_id, lineage_relation, workspace_id, fleet_id FROM agents WHERE execution_mode = 'worker' AND status NOT IN (${terminalPlaceholders})`;
  if (filter.agentId) {
    query += ' AND id = ?';
    params.push(filter.agentId);
  }
  if (filter.workspaceId) {
    query += ' AND workspace_id = ?';
    params.push(filter.workspaceId);
  }
  if (filter.fleetId) {
    query += ' AND fleet_id = ?';
    params.push(filter.fleetId);
  }
  query += ' ORDER BY updated_at DESC LIMIT 50';
  return db.all(query, ...params);
}

function resolveWorkerPid(agentId) {
  const active = activeProcesses.get(agentId);
  if (active?.child?.pid) {
    return { pid: active.child.pid, child: active.child };
  }
  return { pid: null, child: null };
}

async function executeChaosKill(target, options = {}) {
  const { dryRun = false, reason = 'Chaos Engineering Drill' } = options;
  const { pid, child } = resolveWorkerPid(target.id);

  let terminated = false;
  if (!dryRun) {
    if (child) {
      terminated = terminateChild(child);
    } else if (pid) {
      terminated = terminatePid(pid);
    }
  }

  const eventType = dryRun ? 'CHAOS_PLAN_VALIDATED' : (terminated ? 'CHAOS_INJECTED' : 'CHAOS_INJECTION_FAILED');
  let detail;
  if (dryRun) {
    detail = `Chaos plan validated for agent '${target.id}' (${reason}); no process terminated.`;
  } else if (terminated) {
    detail = `Chaos injected: killed worker PID ${pid} for agent '${target.id}' (${reason}).`;
  } else {
    detail = `Chaos injection failed: no live process for agent '${target.id}' (${reason}).`;
  }

  const orchestratorId = target.parent_agent_id || target.id;
  emit(orchestratorId, eventType, 'INJECT_CHAOS', detail, {
    targetAgentId: target.id,
    targetRole: target.role,
    killedPid: terminated ? pid : null,
    resolvedPid: pid,
    lineageRelation: target.lineage_relation,
    dryRun,
    reason
  }, 'warning');

  return { pid, terminated };
}

async function readAgentLineage(db, agent) {
  // lineage_nodes.agent_id is always populated with the owning agent id
  // (including auto-provisioned parents), so the previous `OR id = agent.id`
  // term only ever matched a node whose own id happened to equal the agent id.
  // Let database errors surface instead of masking them as "no lineage".
  const nodes = await db.all(
    'SELECT id, label, node_type FROM lineage_nodes WHERE agent_id = ?',
    agent.id
  );

  return {
    parentAgentId: agent.parent_agent_id || null,
    relation: agent.lineage_relation || 'independent',
    workspaceId: agent.workspace_id || null,
    fleetId: agent.fleet_id || null,
    lineageNodesCount: nodes.length
  };
}

// PID-only drill (`genos inject-chaos --pid <pid>`): terminate exactly the
// requested process, never a random worker.
function injectChaosOnPid(options) {
  const targetPid = Number(options.pid);
  const terminated = options.dryRun ? false : terminatePid(targetPid);
  return {
    success: options.dryRun ? true : terminated,
    operation: 'inject_chaos',
    mode: options.mode || 'kill_worker_pid',
    dryRun: Boolean(options.dryRun),
    targetAgent: { id: null, name: null, role: null, status: null, pid: targetPid },
    lineage: {
      parentAgentId: null,
      relation: 'independent',
      workspaceId: options.workspaceId || null,
      fleetId: options.fleetId || null,
      lineageNodesCount: 0
    },
    regenerationSteward: {
      activated: false,
      strategy: 'lineage_reconstruction',
      lineageId: null,
      missionPreserved: null
    }
  };
}

async function injectChaos(options = {}) {
  if (!options.agentId && options.pid) return injectChaosOnPid(options);

  if (!options.agentId) {
    return {
      success: false,
      operation: 'inject_chaos',
      error: 'CHAOS_TARGET_REQUIRED',
      message: 'An explicit agentId or pid is required to inject chaos.'
    };
  }

  const db = await getDatabase();
  const workers = await findEligibleWorkers(db, options);

  if (!workers.length) {
    return {
      success: false,
      operation: 'inject_chaos',
      error: 'NO_ELIGIBLE_WORKERS',
      message: 'No worker agents found to target for chaos injection.'
    };
  }

  const target = workers[0];
  const lineage = await readAgentLineage(db, target);
  const kill = await executeChaosKill(target, options);
  const dryRun = Boolean(options.dryRun);
  const success = dryRun || kill.terminated;

  const result = {
    success,
    operation: 'inject_chaos',
    mode: options.mode || 'kill_worker_pid',
    dryRun,
    targetAgent: {
      id: target.id,
      name: target.name,
      role: target.role,
      status: target.status,
      pid: kill.pid
    },
    lineage,
    regenerationSteward: {
      activated: kill.terminated,
      strategy: 'lineage_reconstruction',
      lineageId: lineage.parentAgentId ? `lineage_${lineage.parentAgentId}` : `lineage_${target.id}`,
      missionPreserved: null
    }
  };

  if (!success) {
    result.error = 'NO_ACTIVE_PROCESS';
    result.message = `No live process found for worker '${target.id}'; nothing was terminated.`;
  }

  return result;
}

module.exports = {
  injectChaos,
  findEligibleWorkers,
  resolveWorkerPid
};
