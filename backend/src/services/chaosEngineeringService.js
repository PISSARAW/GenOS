/**
 * Chaos Engineering Service for GenOS Metapopulation & Biocénose runtimes.
 * Injects controlled failures (terminating random worker PIDs) to verify
 * that the Regeneration Steward reads the lineage (L_i) and recovers the
 * population without corrupting active orchestrator missions.
 */

const { getDatabase } = require('../db');
const { activeProcesses, emit, TERMINAL_AGENT_STATUSES } = require('./agentOrchestrationState');
const { terminateChild, terminatePid, processMatches } = require('./processTermination');

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
  if (filter.organizationId) {
    query += ' AND workspace_id IN (SELECT id FROM workspaces WHERE organization_id = ?';
    params.push(filter.organizationId);
    if (filter.projectId) {
      query += ' AND project_id = ?';
      params.push(filter.projectId);
    }
    query += ')';
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

// A cluster round-robin may route the chaos request to a worker that does not
// own the in-memory child. Fall back to the persisted runtime_pid so the kill
// still targets the right OS process (and never a reused PID).
async function resolveTargetProcess(db, target) {
  const local = resolveWorkerPid(target.id);
  if (local.pid || !db) return local;
  const row = await db.get(
    'SELECT runtime_pid, runtime_executable FROM agents WHERE id = ?',
    target.id
  );
  if (!row?.runtime_pid) return { pid: null, child: null };
  if (row.runtime_executable && !processMatches(row.runtime_pid, row.runtime_executable)) {
    // PID was reused by an unrelated executable: treat as no live process.
    return { pid: null, child: null, stalePid: row.runtime_pid };
  }
  return { pid: row.runtime_pid, child: null, persisted: true };
}

async function recordChaosAudit(db, target, state) {
  if (!db) return;
  const { actor, dryRun, reason, pid, terminated } = state;
  try {
    await db.run(
      'INSERT INTO audit_logs (actor, agent_id, action, resource, decision, reason, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
      actor || 'system', target.id, 'CHAOS_INJECT', 'worker', terminated ? 'allow' : 'deny', reason,
      JSON.stringify({ targetAgentId: target.id, pid, dryRun, terminated })
    );
  } catch (error) {
    console.warn('[Chaos] audit log write failed:', error.message);
  }
}

function chaosOutcomeDetail(target, state) {
  const { dryRun, terminated, pid, reason } = state;
  if (dryRun) return `Chaos plan validated for agent '${target.id}' (${reason}); no process terminated.`;
  if (terminated) return `Chaos injected: killed worker PID ${pid} for agent '${target.id}' (${reason}).`;
  return `Chaos injection failed: no live process for agent '${target.id}' (${reason}).`;
}

async function executeChaosKill(target, options = {}, db = null) {
  const { dryRun = false, reason = 'Chaos Engineering Drill' } = options;
  const { pid, child } = await resolveTargetProcess(db, target);

  let terminated = false;
  if (!dryRun) {
    if (child) {
      terminated = terminateChild(child);
    } else if (pid) {
      terminated = terminatePid(pid);
    }
  }

  if (terminated && db) {
    await db.run(
      'UPDATE agents SET runtime_pid = NULL, runtime_started_at = NULL, runtime_executable = NULL WHERE id = ?',
      target.id
    );
  }

  await recordChaosAudit(db, target, { actor: options.actor, dryRun, reason, pid, terminated });

  const eventType = dryRun ? 'CHAOS_PLAN_VALIDATED' : (terminated ? 'CHAOS_INJECTED' : 'CHAOS_INJECTION_FAILED');
  const detail = chaosOutcomeDetail(target, { dryRun, terminated, pid, reason });

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

function localChildForPid(pid) {
  for (const proc of activeProcesses.values()) {
    if (proc?.child?.pid === pid) return proc.child;
  }
  return null;
}

function guardExecutable(row, pid, kind) {
  const executable = kind === 'agent' ? row.runtime_executable : row.command;
  if (!executable) return { allowed: false, reason: 'PID_UNVERIFIABLE' };
  if (!processMatches(pid, executable)) return { allowed: false, reason: 'PID_EXECUTABLE_MISMATCH' };
  return kind === 'agent'
    ? { allowed: true, agentId: row.id, organizationId: row.organization_id }
    : { allowed: true, detachedId: row.id };
}

function tenantAllows(options, guard) {
  if (!options.organizationId) return true;
  return guard.organizationId === options.organizationId;
}

// A PID may only be killed when GenOS can prove it is a managed worker (local
// child, `agents.runtime_pid`, or a tracked detached process) AND the executable
// still matches. This closes the remote arbitrary-PID kill, including pgid /
// PID-1 / reused-PID cases.
async function guardManagedPid(db, pid, options = {}) {
  if (!Number.isInteger(pid) || pid <= 10 || pid === process.pid || pid === process.ppid) {
    return { allowed: false, reason: 'PID_REFUSED' };
  }
  const local = localChildForPid(pid);
  if (local) return { allowed: true, child: local };
  const agent = await db.get(
    'SELECT a.id, a.runtime_executable, w.organization_id FROM agents a LEFT JOIN workspaces w ON w.id = a.workspace_id WHERE a.runtime_pid = ?',
    pid
  );
  if (agent) {
    const guard = guardExecutable(agent, pid, 'agent');
    if (!guard.allowed) return guard;
    if (!tenantAllows(options, guard)) return { allowed: false, reason: 'TENANT_MISMATCH' };
    return guard;
  }
  const detached = await db.get('SELECT id, command FROM detached_processes WHERE pid = ?', pid);
  if (detached) return guardExecutable(detached, pid, 'detached');
  return { allowed: false, reason: 'PID_NOT_MANAGED' };
}

async function clearManagedPid(db, guard, pid) {
  if (guard.agentId) {
    await db.run('UPDATE agents SET runtime_pid = NULL, runtime_started_at = NULL, runtime_executable = NULL WHERE id = ?', guard.agentId);
  } else if (guard.detachedId) {
    await db.run('DELETE FROM detached_processes WHERE id = ?', guard.detachedId);
  } else {
    await db.run('UPDATE agents SET runtime_pid = NULL WHERE runtime_pid = ?', pid);
  }
}

// PID-only drill (`genos inject-chaos --pid <pid>`): terminate exactly the
// requested process, and only if it is a verified GenOS-managed worker.
function pidChaosBase(context) {
  const { targetPid, guard, options, dryRun } = context;
  return {
    operation: 'inject_chaos',
    mode: options.mode || 'kill_worker_pid',
    dryRun,
    targetAgent: { id: guard.agentId || null, name: null, role: null, status: null, pid: targetPid },
    lineage: {
      parentAgentId: null,
      relation: 'independent',
      workspaceId: options.workspaceId || null,
      fleetId: options.fleetId || null,
      lineageNodesCount: 0
    },
    regenerationSteward: { activated: false, strategy: 'lineage_reconstruction', lineageId: null, missionPreserved: null }
  };
}

async function injectChaosOnPid(options) {
  const targetPid = Number(options.pid);
  const db = await getDatabase();
  const guard = await guardManagedPid(db, targetPid, options);
  const dryRun = Boolean(options.dryRun);
  const auditTarget = { id: guard.agentId || `pid_${targetPid}` };
  const base = pidChaosBase({ targetPid, guard, options, dryRun });

  if (!guard.allowed) {
    await recordChaosAudit(db, auditTarget, { actor: options.actor, dryRun, reason: options.reason, pid: targetPid, terminated: false });
    return {
      ...base,
      success: false,
      error: guard.reason,
      message: `Refusing to terminate PID ${targetPid}: ${guard.reason}. Only verified GenOS worker PIDs may be killed.`
    };
  }

  const terminated = dryRun ? false : (guard.child ? terminateChild(guard.child) : terminatePid(targetPid));
  if (terminated) await clearManagedPid(db, guard, targetPid);
  await recordChaosAudit(db, auditTarget, { actor: options.actor, dryRun, reason: options.reason, pid: targetPid, terminated });
  return { ...base, success: dryRun || terminated };
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
  const kill = await executeChaosKill(target, options, db);
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
