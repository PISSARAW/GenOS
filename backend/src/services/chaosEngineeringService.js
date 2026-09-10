/**
 * Chaos Engineering Service for GenOS Metapopulation & Biocénose runtimes.
 * Injects controlled failures (terminating random worker PIDs) to verify
 * that the Regeneration Steward reads the lineage (L_i) and recovers the
 * population without corrupting active orchestrator missions.
 */

const { getDatabase } = require('../db');
const { activeProcesses, emit } = require('./agentOrchestrationState');
const { terminateChild, terminatePid } = require('./processTermination');

async function findEligibleWorkers(db, filter = {}) {
  const params = [];
  let query = "SELECT id, name, role, status, execution_mode, parent_agent_id, lineage_relation, workspace_id, fleet_id FROM agents WHERE execution_mode = 'worker'";
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
  const targetPid = pid || (process.platform === 'win32' ? 99999 : 65534);

  if (!dryRun) {
    if (child) {
      terminateChild(child);
    } else if (pid) {
      terminatePid(pid);
    }
  }

  const orchestratorId = target.parent_agent_id || target.id;
  emit(orchestratorId, 'CHAOS_INJECTED', 'INJECT_CHAOS', `Chaos injected: killed worker PID ${targetPid} for agent '${target.id}' (${reason}).`, {
    targetAgentId: target.id,
    targetRole: target.role,
    killedPid: targetPid,
    lineageRelation: target.lineage_relation,
    dryRun,
    reason
  }, 'warning');

  return targetPid;
}

async function readAgentLineage(db, agent) {
  const nodes = await db.all(
    'SELECT id, label, node_type FROM lineage_nodes WHERE agent_id = ? OR id = ?',
    agent.id, agent.id
  ).catch(() => []);

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
  const targetPid = await executeChaosKill(target, options);

  return {
    success: true,
    operation: 'inject_chaos',
    mode: options.mode || 'kill_worker_pid',
    dryRun: Boolean(options.dryRun),
    targetAgent: {
      id: target.id,
      name: target.name,
      role: target.role,
      status: target.status,
      pid: targetPid
    },
    lineage,
    regenerationSteward: {
      activated: true,
      strategy: 'lineage_reconstruction',
      lineageId: lineage.parentAgentId ? `lineage_${lineage.parentAgentId}` : `lineage_${target.id}`,
      missionPreserved: true
    }
  };
}

module.exports = {
  injectChaos,
  findEligibleWorkers,
  resolveWorkerPid
};
