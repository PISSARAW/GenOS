'use strict';

const { spawn } = require('child_process');
const path = require('path');
const crypto = require('crypto');
const adaptive = require('./trinityAdaptiveBudgetService');
const barrier = require('./trinityComparativeBarrier');
const novelty = require('./trinityNoveltyArchive');

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
  await Promise.all(finished.map((item) => db.run(`UPDATE trinity_worlds SET agent_id = ?, updated_at = CURRENT_TIMESTAMP
    WHERE agent_id = ? AND id LIKE ?`, item.workerId, item.priorAgentId, `${input.missionId}%`)));
  return { status: 'executed', allocation, reports: await barrier.buildWorldReportsFromMission(db, input.missionId),
    initialReports: reports, continuationWorkers: finished.map((item) => item.workerId), decisionAuthority: 'none' };
}

async function runQualityDiversityReplicas(input) {
  const { db, missionId, reports, targets, selection } = input;
  const config = selection?.qdConfig || {};
  if (!Number.isSafeInteger(Number(config.tokensPerReplica)) || Number(config.tokensPerReplica) <= 0) {
    return { status: 'incomplete', reason: 'replica_token_budget_missing' };
  }
  const assignments = selection.worldModelAssignments || [];
  const started = [];
  for (const [index, target] of (targets || []).entries()) {
    const source = reports[index % reports.length];
    const route = assignments.find((item) => item.worldNumber === source.worldNumber);
    if (!source || !route) return { status: 'incomplete', reason: 'replica_model_assignment_missing' };
    const workerId = `qd_${crypto.randomUUID()}`;
    const worldNumber = reports.length + index + 1;
    await db.run(`INSERT INTO trinity_worlds (id, mission, world_number, name, strategy, status, agent_id)
      VALUES (?, ?, ?, ?, ?, 'queued', ?)`, `${missionId}_world_${worldNumber}`, input.mission,
    worldNumber, `Trinity QD replica ${index + 1}`, 'quality_diversity_replica', workerId);
    started.push(await startReplica({ ...input, target, route, workerId, worldNumber }));
  }
  const finished = await Promise.all(started.map((item) => waitForContinuation(db, item, input.timeoutMs)));
  const allReports = await barrier.buildWorldReportsFromMission(db, missionId);
  const replicaReports = finished.map((item) => allReports.find((world) => world.agentId === item.workerId));
  if (replicaReports.some((world, index) => !validNicheReceipt(world, finished[index].targetNiche))) {
    return { status: 'incomplete', reason: 'replica_niche_receipt_missing', reports: allReports };
  }
  return { status: 'executed', targetNiches: targets.map((item) => item.targetNiche),
    workerIds: finished.map((item) => item.workerId), reports: allReports, decisionAuthority: 'none' };
}

function validNicheReceipt(world, targetNiche) {
  return Boolean(world?.report?.behaviorVector && world.report.qdTargetNiche === targetNiche
    && novelty.assignNiche({ vector: world.report.behaviorVector }) === targetNiche);
}

async function startReplica(input) {
  const workerId = input.workerId;
  const previousEvent = await input.db.get('SELECT COALESCE(MAX(rowid), 0) as eventId FROM telemetry_events WHERE agent_id = ?', workerId);
  const payload = { action: 'dispatch_worker', background: true, orchestratorId: input.orchestratorId,
    workerId, role: 'quality_diversity_replica', model_tier: input.route.modelTier || 'standard',
    localModel: input.route.localModel || undefined,
    mission: `${input.mission}\nIndependent quality-diversity replica. Target behavioral niche ${input.target.targetNiche}; use a distinct solution approach and report qdTargetNiche exactly plus a behaviorVector with at least 2 normalized [0,1] features and supporting behaviorVectorEvidence IDs.`,
    execution_budget: { tokens: Number(input.selection.qdConfig.tokensPerReplica) },
    executionPolicy: input.selection.workerExecutionPolicy, timeoutMs: input.timeoutMs };
  const accepted = await spawnDispatch({ repoRoot: input.repoRoot, payload });
  if (accepted.workerId !== workerId || accepted.status !== 'accepted') throw new Error('Quality-diversity replica dispatch was rejected.');
  return { workerId, targetNiche: input.target.targetNiche,
    afterEventId: Number(previousEvent?.eventId) || 0, startedAt: Date.now() };
}

function continuationFor(world, reports, assignments) {
  const source = reports.find((entry) => entry.agentId === world.agentId);
  const routing = assignments.find((entry) => entry.worldNumber === world.worldNumber);
  if (!source || !routing || !world.agentId) return null;
  return { ...world, source, routing };
}

async function startContinuation(input) {
  const { db, item, orchestratorId, missionId, repoRoot } = input;
  const workerId = `adaptive_${crypto.randomUUID()}`;
  const payload = dispatchPayload({ input, item: { ...item, agentId: workerId } });
  const accepted = await spawnDispatch({ repoRoot, payload });
  if (accepted.workerId !== workerId || accepted.status !== 'accepted') {
    throw new Error(`Continuation dispatch rejected for world ${item.worldNumber}.`);
  }
  return { workerId, priorAgentId: item.agentId, worldNumber: item.worldNumber,
    afterEventId: 0, startedAt: Date.now(), missionId };
}

function dispatchPayload(context) {
  const { input, item } = context;
  const report = JSON.stringify(item.source.report || {}).slice(0, 8000);
  return { action: 'dispatch_worker', background: true, orchestratorId: input.orchestratorId,
    workerId: item.agentId, role: item.source.role,
    mission: `Continue Trinity world ${item.worldNumber} using only its own prior report. Allocate ${item.tokens} additional tokens. Prior report: ${report}`,
    model_tier: item.routing.modelTier || 'standard', localModel: item.routing.localModel || undefined,
    localRoutingPolicy: item.routing.localModel ? { primary: item.routing.localModel, fallbacks: [], parallelReview: [], mode: 'fallback', preferLocal: true } : undefined,
    execution_budget: { tokens: item.tokens },
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

module.exports = { run, runQualityDiversityReplicas };
