'use strict';

const { spawn } = require('child_process');
const path = require('path');
const crypto = require('crypto');
const contracts = require('./strategyContractService');
const barrier = require('./trinityComparativeBarrier');

const TERMINAL = new Set(['completed', 'error', 'failed', 'terminated', 'apoptosis', 'unverified', 'quarantined']);

async function run(input) {
  const parent = await parentWorkspace(input.db, input.parentAgentId);
  if (!parent?.workspaceRoot) throw runnerError('TRINITY_NESTED_WORKSPACE_MISSING', 'Recursive parent workspace is unavailable.');
  const childId = `trinity_recursive_${crypto.randomUUID()}`;
  const missionId = `${childId}_mission`;
  await createChildOrchestrator(input.db, { childId, parentAgentId: input.parentAgentId, mission: input.mission });
  await contracts.saveContract(input.db, { agentId: childId, problem: input.mission, createdBy: 'trinity_recursive' });
  await spawnMission({ ...input, childId, missionId, workspaceRoot: parent.workspaceRoot });
  return waitForChild(input.db, { missionId, repoRoot: input.repoRoot, timeoutMs: input.timeoutMs });
}

async function parentWorkspace(db, parentAgentId) {
  return db.get(`SELECT w.path as workspaceRoot FROM agents a
    LEFT JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ?`, parentAgentId);
}

async function createChildOrchestrator(db, child) {
  await db.run(`INSERT INTO agents (id, name, role, status, execution_mode, model_tier,
    isolation_mode, current_task, parent_agent_id, lineage_relation)
    VALUES (?, 'Recursive Trinity Orchestrator', 'Autonomous Orchestrator', 'idle',
    'orchestrator', 'standard', 'Branch', ?, ?, 'recursive_trinity')`,
  child.childId, child.mission, child.parentAgentId);
}

function spawnMission(input) {
  return new Promise((resolve, reject) => {
    const script = path.resolve(input.repoRoot, 'backend/bin/genos-orchestrate.cjs');
    const payload = JSON.stringify({ action: 'dispatch_trinity', background: true,
      orchestratorId: input.childId, missionId: input.missionId, mission: input.mission,
      trinityMissionId: input.missionId,
      variant: Number(input.depth) < 3 ? 'recursive' : 'controlled',
      recursiveDepth: Number(input.depth) || 0, recursiveSpentBudget: Number(input.spentBudget) || 0,
      workspace_root: input.workspaceRoot, timeoutMs: input.timeoutMs });
    const child = spawn(process.execPath, [script, payload], { cwd: input.repoRoot,
      detached: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code !== 0) return reject(runnerError('TRINITY_NESTED_DISPATCH_FAILED', stderr || `Nested dispatch exited ${code}.`));
      try {
        const accepted = JSON.parse(stdout);
        if (accepted.missionId !== input.missionId || accepted.status !== 'accepted') throw new Error('Nested dispatch was not accepted.');
        resolve(accepted);
      } catch (error) { reject(runnerError('TRINITY_NESTED_DISPATCH_INVALID', error.message)); }
    });
  });
}

async function waitForChild(db, input) {
  const deadline = Date.now() + (input.timeoutMs || 180000);
  while (Date.now() < deadline) {
    const rows = await db.all(`SELECT w.agent_id as agentId, a.status FROM trinity_worlds w
      LEFT JOIN agents a ON a.id = w.agent_id WHERE w.id LIKE ? ORDER BY w.world_number`, `${input.missionId}%`);
    if (rows.length >= 3 && rows.every((row) => TERMINAL.has(row.status))) {
      return barrier.buildWorldReportsFromMission(db, input.missionId);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw runnerError('TRINITY_NESTED_TIMEOUT', `Nested Trinity timed out: ${input.missionId}`);
}

function runnerError(code, message) { return Object.assign(new Error(message), { code }); }

module.exports = { run };
