#!/usr/bin/env node
// MCP-to-backend bridge. It owns one complete GenOS mission, including the
// authority contract and bounded worker fleet, then returns its telemetry.
const path = require('path');
const { spawn } = require('child_process');
const { getDatabase, closeDatabase } = require('../src/db');
const runtime = require('../src/services/agentRuntimeAdapter');
const contracts = require('../src/services/strategyContractService');
const workerGarage = require('../src/services/workerGarageService');
const aTeamService = require('../src/services/aTeamService');
const trinityService = require('../src/services/trinityService');

const request = JSON.parse(process.argv[2] || '{}');
const action = request.action || 'orchestrate';
const task = String(request.mission || request.task || 'Autonomous GenOS orchestration');
const orchestratorId = request.orchestratorId || `mcp_orchestrator_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
let id = action === 'dispatch_worker'
  ? request.workerId || `worker_${orchestratorId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  : orchestratorId;
// Accept the policy at the top level (current schema) and inside `arguments`
// while older long-lived MCP clients refresh their cached tool schema.
const policyRequest = request.arguments && typeof request.arguments === 'object' ? request.arguments : request;
const allowedCommands = Array.isArray(policyRequest.allowed_commands)
  ? [...new Set(policyRequest.allowed_commands.map((value) => String(value).trim()).filter(Boolean))]
  : [];
const allowFileEdits = policyRequest.allow_file_edits === true;

// This bridge creates a root authority boundary. A delegated worker must never
// be able to enter it, even if a globally configured/public GenOS MCP endpoint
// accidentally leaks into the worker's Codex process.
if (String(process.env.GENOS_EXECUTION_MODE || '').toLowerCase() === 'worker') {
  const owner = process.env.GENOS_ORCHESTRATOR_AGENT_ID || 'its orchestrator';
  throw new Error(`GenOS worker recursion blocked: delegated workers must return evidence to ${owner}, not create another orchestrator.`);
}

async function waitForCompletion(db) {
  const deadline = Date.now() + Number(request.timeoutMs || 14 * 60 * 1000);
  while (Date.now() < deadline) {
    const agents = await db.all('SELECT id, status FROM agents WHERE id = ? OR parent_agent_id = ?', id, id);
    if (agents.length && agents.every((agent) => ['idle', 'blocked', 'error', 'terminated', 'apoptosis'].includes(agent.status))) return agents;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('GenOS orchestrator timed out');
}

function tokenUsage(runs) {
  const executionRuns = runs.map((run) => {
    let metrics = {}; try { metrics = JSON.parse(run.metrics_json || '{}'); } catch (_) {}
    return { agentId: run.agent_id, status: run.status, tokens: Number(metrics.tokens || 0) };
  });
  return { executionRuns, totalTokens: executionRuns.reduce((sum, run) => sum + run.tokens, 0), allRunsCompleted: executionRuns.length > 0 && executionRuns.every((run) => run.status === 'completed') };
}

async function main() {
  // MCP tool calls are request/response interactions. Do not hold the response
  // open for the whole mission: return the durable agent ID immediately and
  // let a detached runner own its lifecycle and final telemetry.
  if (request.background === true) {
    let reusableWorker = null;
    if (action === 'dispatch_worker' && !request.workerId) {
      const lookupDb = await getDatabase();
      try {
        reusableWorker = await workerGarage.findReusableWorker(lookupDb, orchestratorId, {
          mission: task,
          role: String(request.role || 'implementation')
        });
        if (reusableWorker) id = reusableWorker.id;
      } finally {
        await closeDatabase();
      }
    }
    const runnerRequest = {
      ...request,
      background: false,
      orchestratorId,
      workerId: action === 'dispatch_worker' ? id : request.workerId,
      ...(action === 'dispatch_worker' ? {
        reuseChecked: true,
        reuseWorkerId: reusableWorker?.id || null
      } : {})
    };
    const runner = spawn(process.execPath, [__filename, JSON.stringify(runnerRequest)], {
      cwd: path.resolve(__dirname, '../..'),
      detached: true,
      stdio: 'ignore'
    });
    runner.unref();
    process.stdout.write(JSON.stringify({
      orchestratorId,
      ...(action === 'dispatch_worker' ? {
        workerId: id,
        reusedWorker: Boolean(reusableWorker),
        ...(reusableWorker ? { matchedScope: reusableWorker.affinity.shared } : {})
      } : {}),
      status: 'accepted',
      acceptedAt: new Date().toISOString(),
      task
    }));
    return;
  }

  const db = await getDatabase();
  let delegatedWorkerId = null;
  let reusedWorker = false;
  try {
    if (action === 'dispatch_trinity') {
      const parent = await db.get("SELECT id FROM agents WHERE id = ? AND execution_mode = 'orchestrator'", orchestratorId);
      if (!parent) throw new Error(`Orchestrator '${orchestratorId}' was not found.`);
      if (!await contracts.getLatestContract(db, orchestratorId)) throw new Error(`No strategy contract is available for orchestrator '${orchestratorId}'.`);
      const garage = await workerGarage.state(db, orchestratorId);
      if (garage.available < 3) {
        const error = new Error(`Trinity requires three free worker slots, but only ${garage.available} are available.`);
        error.code = 'WORKER_GARAGE_FULL';
        throw error;
      }
      const members = trinityService.compose(request.mission);
      const missionId = `trinity_${orchestratorId}_${Date.now()}`;
      const accepted = [];
      for (const member of members) {
        const workerId = `worker_${orchestratorId}_${Date.now()}_${member.worldNumber}_${Math.random().toString(36).slice(2, 6)}`;
        const name = `Trinity Worker (World ${member.worldNumber}: ${member.label})`;
        await db.run(
          `INSERT INTO trinity_worlds (id, mission, world_number, name, strategy, status, agent_id)
           VALUES (?, ?, ?, ?, ?, 'queued', ?)`,
          `${missionId}_world_${member.worldNumber}`, request.mission, member.worldNumber, name, member.role, workerId
        );
        const runner = spawn(process.execPath, [__filename, JSON.stringify({
          action: 'dispatch_worker', background: false, orchestratorId, workerId,
          name, mission: member.mission, role: member.role, model_tier: member.modelTier,
          execution_budget: request.execution_budget, workspace_root: request.workspace_root,
          reuseChecked: true
        })], { cwd: path.resolve(__dirname, '../..'), detached: true, stdio: 'ignore' });
        runner.unref();
        accepted.push({ workerId, worldNumber: member.worldNumber, strategy: member.role, status: 'accepted' });
      }
      process.stdout.write(JSON.stringify({
        orchestratorId,
        trinity: { status: 'accepted', missionId, mission: request.mission, worlds: accepted }
      }));
      return;
    }
    if (action === 'dispatch_team') {
      const parent = await db.get("SELECT id FROM agents WHERE id = ? AND execution_mode = 'orchestrator'", orchestratorId);
      if (!parent) throw new Error(`Orchestrator '${orchestratorId}' was not found.`);
      if (!await contracts.getLatestContract(db, orchestratorId)) throw new Error(`No strategy contract is available for orchestrator '${orchestratorId}'.`);
      const garage = await workerGarage.state(db, orchestratorId);
      const members = aTeamService.compose({
        projectGoal: request.project_goal,
        subSystems: request.sub_systems,
        assignedRoles: request.assigned_roles,
        modelTiers: request.model_tiers,
        available: garage.available
      });
      const accepted = members.map((member, index) => {
        const workerId = `worker_${orchestratorId}_${Date.now()}_${index + 1}_${Math.random().toString(36).slice(2, 6)}`;
        const runner = spawn(process.execPath, [__filename, JSON.stringify({
          action: 'dispatch_worker', background: false, orchestratorId, workerId,
          mission: member.mission, role: member.role, model_tier: member.modelTier,
          workspace_root: request.workspace_root, reuseChecked: true
        })], { cwd: path.resolve(__dirname, '../..'), detached: true, stdio: 'ignore' });
        runner.unref();
        return { workerId, subSystem: member.subSystem, role: member.role, modelTier: member.modelTier, status: 'accepted' };
      });
      process.stdout.write(JSON.stringify({
        orchestratorId,
        aTeam: { status: 'accepted', projectGoal: request.project_goal, capacity: workerGarage.MAX_ACTIVE_WORKERS, members: accepted }
      }));
      return;
    }
    if (action === 'dispatch_worker') {
      const parent = await db.get(`SELECT a.id, a.name, a.agent_type, a.workspace_id, a.fleet_id, a.model_tier, a.language, a.isolation_mode,
        w.path as workspace_root FROM agents a LEFT JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ? AND a.execution_mode = 'orchestrator'`, orchestratorId);
      if (!parent) throw new Error(`Orchestrator '${orchestratorId}' was not found.`);
      const role = String(request.role || 'implementation');
      let reusable = null;
      if (request.reuseWorkerId) {
        const selected = await db.get(
          `SELECT id, name, role, about, model_tier as modelTier, language, isolation_mode as isolationMode
           FROM agents WHERE id = ? AND parent_agent_id = ? AND execution_mode = 'worker' AND status = 'idle'`,
          request.reuseWorkerId, orchestratorId
        );
        const affinity = workerGarage.reuseAffinity(selected, { mission: task, role });
        if (!affinity) throw new Error(`Selected worker '${request.reuseWorkerId}' is no longer idle or the mission is outside its scope.`);
        reusable = { ...selected, affinity };
        id = selected.id;
      } else if (request.reuseChecked !== true) {
        reusable = await workerGarage.findReusableWorker(db, orchestratorId, { mission: task, role });
        if (reusable) id = reusable.id;
      }
      reusedWorker = Boolean(reusable);
      await workerGarage.requireAvailableSlot(db, orchestratorId, reusedWorker ? id : null);
      const name = String(request.name || workerGarage.workerName({ role, mission: task }));
      const sourceWorkspace = request.workspace_root || parent.workspace_root || process.env.GENOS_WORKSPACE_ROOT || path.resolve(__dirname, '../..');
      const capsuleId = reusedWorker ? `${id}_run_${Date.now()}` : id;
      const workspaceRoot = await runtime.createIsolatedWorkspace(sourceWorkspace, capsuleId, path.dirname(sourceWorkspace));
      if (!reusedWorker) {
        await db.run(`INSERT INTO agents (id, name, role, status, agent_type, execution_mode, workspace_id, fleet_id, model_tier, language, isolation_mode, parent_agent_id, lineage_relation, about, current_task)
          VALUES (?, ?, ?, 'idle', ?, 'worker', ?, ?, ?, ?, ?, ?, 'garage_delegation', ?, ?)`,
          id, name, role, parent.agent_type || 'GenOS', parent.workspace_id || null, parent.fleet_id || null,
          request.model_tier || parent.model_tier || 'standard', parent.language || 'TypeScript', parent.isolation_mode || 'Branch', orchestratorId,
          `Worker scope: ${task}`, task);
      }
      delegatedWorkerId = id;
      const garage = await workerGarage.reserveSlot(db, { orchestratorId, workerId: id, name, role, mission: task });
      const strategyContract = await contracts.getLatestContract(db, orchestratorId);
      if (!strategyContract) throw new Error(`No strategy contract is available for orchestrator '${orchestratorId}'.`);
      let inheritedCommands = [];
      try { inheritedCommands = JSON.parse(process.env.GENOS_ALLOWED_COMMANDS_JSON || '[]'); } catch {}
      await runtime.startMission({
        agentId: id, name, role, prompt: task, modelTier: request.model_tier || reusable?.modelTier || parent.model_tier,
        workspaceRoot, workspaceIsolation: parent.isolation_mode, workspaceId: parent.workspace_id,
        fleetId: parent.fleet_id, agentType: parent.agent_type, orchestratorAgentId: orchestratorId,
        strategyContract: strategyContract.contract, executionBudget: request.execution_budget || {},
        executionPolicy: {
          allowedCommands: Array.isArray(inheritedCommands) ? inheritedCommands : [],
          allowFileEdits: /^(1|true)$/i.test(String(process.env.GENOS_ALLOW_FILE_EDITS || ''))
        },
        toolLease: runtime.workerToolLease(role), autonomousOrchestration: false
      });
      const agents = await waitForCompletion(db);
      process.stdout.write(JSON.stringify({
        orchestratorId,
        workerId: id,
        workerName: name,
        reusedWorker,
        ...(reusable?.affinity ? { matchedScope: reusable.affinity.shared } : {}),
        garage: { slot: garage.slot, capacity: garage.capacity },
        agents
      }));
      return;
    }
    await db.run(`INSERT INTO agents (id, name, role, status, execution_mode, model_tier, isolation_mode, current_task)
      VALUES (?, 'MCP GenOS Orchestrator', 'Autonomous Orchestrator', 'idle', 'orchestrator', 'frontier', 'Branch', ?)`, id, task);
    const strategyContract = await contracts.saveContract(db, { agentId: id, problem: task, createdBy: 'mcp_orchestrate' });
    await runtime.startMission({ agentId: id, name: 'MCP GenOS Orchestrator', role: 'Autonomous Orchestrator', prompt: task,
      modelTier: 'frontier', strategyContract: strategyContract.contract, executionBudget: request.executionBudget || {},
      executionPolicy: { allowedCommands, allowFileEdits },
      autonomousOrchestration: policyRequest.autonomous_orchestration !== false });
    const agents = await waitForCompletion(db);
    const telemetry = await db.all('SELECT event_type, action, detail, severity FROM telemetry_events WHERE agent_id = ? OR agent_id IN (SELECT id FROM agents WHERE parent_agent_id = ?) ORDER BY created_at', id, id);
    const runs = await db.all('SELECT agent_id, status, metrics_json FROM strategy_execution_runs WHERE agent_id = ? OR agent_id IN (SELECT id FROM agents WHERE parent_agent_id = ?) ORDER BY created_at', id, id);
    process.stdout.write(JSON.stringify({ orchestratorId: id, agents, telemetry, token_usage: tokenUsage(runs) }));
  } catch (error) {
    if (delegatedWorkerId) {
      await db.run("UPDATE agents SET status = 'error', current_task = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", error.message, delegatedWorkerId).catch(() => {});
      await db.run("UPDATE trinity_worlds SET status = 'error', updated_at = CURRENT_TIMESTAMP WHERE agent_id = ?", delegatedWorkerId).catch(() => {});
    }
    throw error;
  } finally { await closeDatabase(); }
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
