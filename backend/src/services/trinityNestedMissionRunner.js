'use strict';
const { spawn } = require('child_process');
const path = require('path');
const crypto = require('crypto');
const contracts = require('./strategyContractService');
const barrier = require('./trinityComparativeBarrier');
const { withTransaction } = require('../db');

async function run(input) {
  if (!Number.isSafeInteger(input.tokens) || input.tokens < 3) throw runnerError('TRINITY_NESTED_BUDGET_REQUIRED', 'Recursive child token budget is missing.');
  const parent = await parentWorkspace(input.db, input.parentAgentId);
  if (!parent?.workspaceRoot) throw runnerError('TRINITY_NESTED_WORKSPACE_MISSING', 'Recursive parent workspace is unavailable.');
  const childId = 'trinity_recursive_' + crypto.createHash('sha256').update(input.parentAgentId + ':' + input.mission + ':' + input.depth).digest('hex').slice(0, 32);
  const missionId = childId + '_mission';
  await createChildOrchestrator(input.db, { childId, parentAgentId: input.parentAgentId, mission: input.mission });
  const previous = await input.db.get('SELECT id FROM trinity_experiments WHERE mission_id = ?', missionId);
  if (!previous) await contracts.saveContract(input.db, { agentId: childId, problem: input.mission, createdBy: 'trinity_recursive' });
  await spawnMission({ ...input, childId, missionId, workspaceRoot: parent.workspaceRoot });
  return waitForChild(input.db, { missionId, timeoutMs: input.timeoutMs });
}
async function parentWorkspace(db, parentAgentId) {
  return db.get('SELECT w.path as workspaceRoot FROM agents a LEFT JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ?', parentAgentId);
}
async function createChildOrchestrator(db, child) {
  return withTransaction(db, async tx => {
    const existing = await tx.get('SELECT parent_agent_id, current_task FROM agents WHERE id = ?', child.childId);
    if (existing) {
      if (existing.parent_agent_id !== child.parentAgentId || existing.current_task !== child.mission) throw runnerError('TRINITY_NESTED_ID_CONFLICT', 'Recursive child identity changed.');
      return false;
    }
    const parent = await tx.get('SELECT cognitive_budget, workspace_id FROM agents WHERE id = ?', child.parentAgentId);
    const budget = Math.floor(Number(parent?.cognitive_budget) * 0.3 * 1000000) / 1000000;
    if (!Number.isFinite(budget) || budget <= 0) throw runnerError('TRINITY_NESTED_BUDGET_REQUIRED', 'Recursive parent has no cognitive budget to transfer.');
    await tx.run("INSERT INTO agents (id, name, role, status, execution_mode, model_tier, isolation_mode, current_task, parent_agent_id, lineage_relation, cognitive_budget, cognitive_baseline_budget, workspace_id) VALUES (?, 'Recursive Trinity Orchestrator', 'Autonomous Orchestrator', 'idle', 'orchestrator', 'standard', 'Branch', ?, ?, 'recursive_trinity', ?, ?, ?)", child.childId, child.mission, child.parentAgentId, budget, budget, parent.workspace_id || null);
    const debit = await tx.run('UPDATE agents SET cognitive_budget = ROUND(cognitive_budget - ?, 6) WHERE id = ? AND cognitive_budget >= ?', budget, child.parentAgentId, budget);
    if (debit.changes !== 1) throw runnerError('TRINITY_NESTED_BUDGET_REQUIRED', 'Recursive cognitive budget debit failed.');
    return true;
  });
}
function missionPayload(input) {
  return { action: 'dispatch_trinity', background: true, orchestratorId: input.childId,
    trinityMissionId: input.missionId, mission: input.mission,
    variant: Number(input.depth) < 3 ? 'recursive' : 'controlled',
    recursiveDepth: Number(input.depth) || 0, recursiveSpentBudget: Number(input.spentBudget) || 0,
    recursiveParentProblemIds: input.parentProblemIds || [], execution_budget: { tokens: input.tokens },
    executionPolicy: input.executionPolicy, workspace_root: input.workspaceRoot, timeoutMs: input.timeoutMs };
}
function acceptedFrom(stdout, missionId) {
  const envelope = JSON.parse(stdout);
  const accepted = envelope.trinity || envelope;
  if (accepted.missionId !== missionId || accepted.status !== 'accepted') throw runnerError('TRINITY_NESTED_DISPATCH_INVALID', 'Nested dispatch was not accepted.');
  return accepted;
}
function spawnMission(input) {
  return new Promise((resolve, reject) => {
    const script = path.resolve(input.repoRoot, 'backend/bin/genos-orchestrate.cjs');
    const child = spawn(process.execPath, [script, JSON.stringify(missionPayload(input))], { cwd: input.repoRoot,
      detached: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.once('error', reject);
    child.once('close', code => finishDispatch({ code, stdout, stderr, input, resolve, reject }));
  });
}
function finishDispatch(result) {
  if (result.code !== 0 && result.stderr.includes('TRINITY_EXECUTION_BUSY')) return result.resolve({ status: 'already_active' });
  if (result.code !== 0) return result.reject(runnerError('TRINITY_NESTED_DISPATCH_FAILED', result.stderr || 'Nested dispatch failed.'));
  try { result.resolve(acceptedFrom(result.stdout, result.input.missionId)); }
  catch (error) { result.reject(runnerError('TRINITY_NESTED_DISPATCH_INVALID', error.message)); }
}
async function waitForChild(db, input) {
  const deadline = Date.now() + (input.timeoutMs || 180000);
  while (Date.now() < deadline) {
    const experiment = await db.get('SELECT status, decision_json FROM trinity_experiments WHERE mission_id = ?', input.missionId);
    if (experiment?.status === 'promoted') return promotedReports(db, input.missionId);
    if (terminalFailure(experiment)) throw runnerError('TRINITY_NESTED_PROMOTION_REQUIRED', 'Recursive child was not promoted.');
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw runnerError('TRINITY_NESTED_TIMEOUT', 'Nested Trinity timed out: ' + input.missionId);
}
function terminalFailure(experiment) {
  if (['escalated', 'promotion_failed'].includes(experiment?.status)) return true;
  if (experiment?.status !== 'decided') return false;
  return JSON.parse(experiment.decision_json || '{}').outcome === 'KEEP_PARETO_SET';
}
async function promotedReports(db, missionId) {
  const promotion = await require('./trinityPromotionIntegrity').previousPromotion({ db, missionId });
  if (!promotion?.promoted) throw runnerError('TRINITY_NESTED_PROMOTION_REQUIRED', 'Recursive promotion integrity failed.');
  const reports = await barrier.buildWorldReportsFromMission(db, missionId);
  reports.childPromotion = promotion;
  return reports;
}
function runnerError(code, message) { return Object.assign(new Error(message), { code }); }
module.exports = { run, missionPayload, acceptedFrom, createChildOrchestrator };
