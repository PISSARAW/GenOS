'use strict';

const { spawn } = require('child_process');
const path = require('path');
const adaptive = require('./trinityAdaptiveBudgetService');
const barrier = require('./trinityComparativeBarrier');

const TERMINAL = new Set(['completed', 'error', 'failed', 'terminated', 'apoptosis', 'unverified', 'quarantined']);

async function run(input) {
  const { db, reports, selection } = input;
  const config = selection?.adaptiveBudgetConfig || {};
  const results = (reports || []).map((world) => ({ agentId: world.agentId,
    status: world.outcome === 'failed' ? 'failed' : 'completed', payload: { evidenceReport: world.report } }));
  const allocation = adaptive.allocate({ workerIds: reports.map((world) => world.agentId),
    results, pool: Number(config.poolTokens), minimumTokens: Number(config.minimumTokens) });
  if (!allocation) return { status: 'incomplete', reason: 'verified_uncertainty_or_budget_missing' };
  const assignments = selection.worldModelAssignments || [];
  const continuations = allocation.worlds.map((world) => continuationFor(world, reports, assignments));
  if (continuations.some((item) => !item)) return { status: 'incomplete', reason: 'worker_routing_assignment_missing' };
  const starts = await Promise.all(continuations.map((item) => startContinuation({ ...input, item })));
  const finished = await Promise.all(starts.map((item) => waitForContinuation(db, item, input.timeoutMs)));
  return { status: 'executed', allocation, reports: await barrier.buildWorldReportsFromMission(db, input.missionId),
    continuationWorkers: finished.map((item) => item.workerId), decisionAuthority: 'none' };
}

function continuationFor(world, reports, assignments) {
  const source = reports.find((entry) => entry.agentId === world.agentId);
  const routing = assignments.find((entry) => entry.worldNumber === world.worldNumber);
  if (!source || !routing || !world.agentId) return null;
  return { ...world, source, routing };
}

async function startContinuation(input) {
  const { db, item, orchestratorId, missionId, repoRoot, executionPolicy } = input;
  const workspace = await db.get(`SELECT w.path as workspaceRoot FROM agents a
    LEFT JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ?`, item.agentId);
  const previousEvent = await db.get('SELECT COALESCE(MAX(rowid), 0) as eventId FROM telemetry_events WHERE agent_id = ?', item.agentId);
  const payload = dispatchPayload({ input, item, workspaceRoot: workspace?.workspaceRoot });
  const accepted = await spawnDispatch({ repoRoot, payload });
  if (accepted.workerId !== item.agentId || accepted.status !== 'accepted') {
    throw new Error(`Continuation dispatch rejected for world ${item.worldNumber}.`);
  }
  return { workerId: item.agentId, afterEventId: Number(previousEvent?.eventId) || 0,
    startedAt: Date.now(), missionId };
}

function dispatchPayload(context) {
  const { input, item, workspaceRoot } = context;
  const report = JSON.stringify(item.source.report || {}).slice(0, 8000);
  return { action: 'dispatch_worker', background: true, orchestratorId: input.orchestratorId,
    workerId: item.agentId, role: item.source.role,
    mission: `Continue Trinity world ${item.worldNumber} using only its own prior report. Allocate ${item.tokens} additional tokens. Prior report: ${report}`,
    model_tier: item.routing.modelTier || 'standard', localModel: item.routing.localModel || undefined,
    localRoutingPolicy: item.routing.localModel ? { primary: item.routing.localModel, fallbacks: [], parallelReview: [], mode: 'fallback', preferLocal: true } : undefined,
    workspace_root: workspaceRoot, execution_budget: { tokens: item.tokens },
    executionPolicy: input.executionPolicy, timeoutMs: input.timeoutMs };
}

function spawnDispatch(input) {
  return new Promise((resolve, reject) => {
    const script = path.resolve(input.repoRoot, 'backend/bin/genos-orchestrate.cjs');
    const child = spawn(process.execPath, [script, JSON.stringify(input.payload)], {
      cwd: input.repoRoot, detached: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.once('error', reject);
    child.once('close', (code) => resolveDispatch({ code, stdout, stderr, resolve, reject }));
  });
}

function resolveDispatch(result) {
  if (result.code !== 0) return result.reject(new Error(result.stderr || 'Continuation dispatch failed.'));
  try { result.resolve(JSON.parse(result.stdout)); }
  catch (_) { result.reject(new Error('Continuation dispatch returned invalid acceptance data.')); }
}

async function waitForContinuation(db, continuation, timeoutMs) {
  const deadline = continuation.startedAt + (Number(timeoutMs) || 180000);
  while (Date.now() < deadline) {
    const agent = await db.get('SELECT status FROM agents WHERE id = ?', continuation.workerId);
    const event = await db.get(`SELECT rowid as eventId FROM telemetry_events
      WHERE agent_id = ? AND rowid > ? AND event_type IN ('EVIDENCE_REPORT','AGENT_COMPLETED')
      ORDER BY rowid DESC LIMIT 1`, continuation.workerId, continuation.afterEventId);
    if (TERMINAL.has(agent?.status) && event) return continuation;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Adaptive continuation timed out for worker ${continuation.workerId}.`);
}

module.exports = { run };
