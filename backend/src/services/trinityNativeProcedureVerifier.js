'use strict';

const crypto = require('node:crypto');
const cryptoDigest = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const VERIFIER_DIGEST = `sha256:${crypto.createHash('sha256').update('genos-native-lpt-independent-auditor-v1').digest('hex')}`;

function invalid(world, reason) {
  return { ...world, report: { ...(world.report || {}), nativeProcedureVerification: { status: 'failed', reason } } };
}

function expectedLpt(parameters) {
  const jobs = parameters?.jobs;
  const machines = parameters?.machines;
  if (!validLptInput(jobs, machines)) return null;
  const identifiers = jobs.map((job) => job.id);
  if (new Set(identifiers).size !== identifiers.length) return null;
  return scheduleLpt(jobs, machines);
}

function validLptInput(jobs, machines) {
  return Array.isArray(jobs) && jobs.length > 0 && Number.isSafeInteger(machines)
    && machines >= 1 && machines <= 64 && jobs.length <= 10000
    && jobs.every(validJob);
}

function validJob(job) {
  return Boolean(job) && typeof job.id === 'string'
    && Number.isSafeInteger(job.duration) && job.duration >= 1;
}

function scheduleLpt(jobs, machines) {
  const loads = Array.from({ length: machines }, () => ({ jobs: [], load: 0 }));
  for (const job of [...jobs].sort((a, b) => b.duration - a.duration || a.id.localeCompare(b.id))) {
    let target = 0;
    for (let index = 1; index < loads.length; index += 1) if (loads[index].load < loads[target].load) target = index;
    loads[target].jobs.push(job.id);
    loads[target].load += job.duration;
  }
  return { assignments: loads.map((item, machine) => ({ machine, ...item })), makespan: Math.max(...loads.map((item) => item.load)) };
}

function methodContract(report) {
  return report.workerArtifact?.methodContract || report.workerArtifact?.content?.methodContract || null;
}

function proceduresOf(method) {
  if (['scoped_procedure', 'niche_procedure', 'host_procedure'].includes(method?.methodId)) {
    return [method.parameters?.procedure].filter(Boolean);
  }
  if (method?.methodId === 'adapt_procedure') return (method.parameters?.trials || []).map((trial) => trial.procedure);
  return [];
}

function procedureReceiptsOf(content, method) {
  if (method?.methodId === 'adapt_procedure') return content.trialReceipts || [];
  return [content.procedureReceipt].filter(Boolean);
}

function receiptMatches(procedure, receipt, output) {
  const inputDigest = cryptoDigest({ methodId: procedure.methodId, parameters: procedure.parameters });
  const receiptDigest = `solver://sha256:${cryptoDigest({ methodId: procedure.methodId, inputDigest, output })}`;
  return receipt?.inputDigest === `sha256:${inputDigest}` && receipt?.id === receiptDigest
    && JSON.stringify(receipt.result) === JSON.stringify(output);
}

function outputsOf(context) {
  const { world, method, procedures, receipts } = context;
  if (method.methodId === 'adapt_procedure') {
    const computed = procedures.map((procedure) => expectedLpt(procedure.parameters));
    if (computed.some((value, index) => !validComputedReceipt(value, procedures[index], receipts[index]))) return null;
    const best = computed.reduce((winner, value, index) => value.makespan < computed[winner].makespan ? index : winner, 0);
    const content = world.report.workerArtifact.content;
    if (JSON.stringify(content.result) !== JSON.stringify(computed[best])) return null;
    return computed[best];
  }
  const procedure = procedures[0];
  const output = world.report.workerArtifact.content.result;
  const replay = expectedLpt(procedure.parameters);
  return replay && JSON.stringify(replay) === JSON.stringify(output)
    && receiptMatches(procedure, receipts[0], output) ? output : null;
}

function validComputedReceipt(value, procedure, receipt) {
  return Boolean(value) && receiptMatches(procedure, receipt, value);
}

function audit(context) {
  const { world, run } = context;
  const report = world.report || {};
  const content = report.workerArtifact?.content || {};
  const method = methodContract(report);
  const procedures = proceduresOf(method);
  const receipts = procedureReceiptsOf(content, method);
  if (method?.version !== 1 || !procedures.length || procedures.length !== receipts.length) return invalid(world, 'native_lpt_contract_missing');
  const output = outputsOf({ world, method, procedures, receipts });
  if (!output) return invalid(world, 'independent_lpt_replay_or_receipt_mismatch');
  const robustness = orderRobustness(procedures[0].parameters, output);
  if (robustness === null) return invalid(world, 'native_lpt_input_order_perturbation_failed');
  const runCheck = checkExecutionRun(run);
  if (runCheck.reason) return invalid(world, runCheck.reason);
  return verified({ world, report, receipts, run, output, latencyMs: runCheck.latencyMs, robustness });
}

function checkExecutionRun(run) {
  const budget = JSON.parse(run.budget_json || '{}');
  const metrics = JSON.parse(run.metrics_json || '{}');
  const withinBudget = Number(metrics.tokens || 0) <= Number(budget.tokens);
  if (run.status !== 'completed') return { reason: `native_lpt_run_not_completed:${run.status}:${run.guardrail_reason || 'unknown'}` };
  if (!withinBudget) return { reason: 'native_lpt_budget_unverified' };
  const started = Date.parse(run.started_at);
  const completed = Date.parse(run.completed_at);
  const latencyMs = completed - started;
  if (!Number.isFinite(latencyMs) || latencyMs < 0) return { reason: 'native_lpt_latency_unverified' };
  return { latencyMs };
}

function orderRobustness(parameters, output) {
  const reversed = expectedLpt({ ...parameters, jobs: [...parameters.jobs].reverse() });
  return reversed && JSON.stringify(reversed) === JSON.stringify(output) ? 0.5 : null;
}

function verified(context) {
  const { world, report, receipts, run, output, latencyMs, robustness } = context;
  const evidenceId = `native-lpt-audit-${world.worldNumber}-${cryptoDigest([receipts.map((item) => item.id), output, latencyMs, robustness]).slice(0, 20)}`;
  const evidenceDigest = `sha256:${cryptoDigest({ agentId: world.agentId, runId: run.id,
    receipts: receipts.map((item) => item.id), output, latencyMs, robustness })}`;
  const verificationReceipt = {
    status: 'verified', independent: true, evidenceDigest, verifierDigest: VERIFIER_DIGEST,
    independenceDescriptor: { actorId: 'genos-native-lpt-independent-auditor', workspaceId: `trinity-world-${world.worldNumber}-audit` }
  };
  const receiptEvidence = receipts.map((item) => ({ id: item.id, verificationReceipt: {
    ...verificationReceipt, evidenceDigest: `sha256:${cryptoDigest({ runId: run.id, receiptId: item.id, output })}`
  } }));
  const dimensions = ['correctness', 'coverage', 'robustness', 'reproducibility', 'risk', 'uncertainty', 'constraintCoverage', 'latency'];
  return { ...world, report: { ...report, evidence: [...(report.evidence || []), ...receiptEvidence, { id: evidenceId, verificationReceipt }],
    evidenceVector: { ...report.evidenceVector, correctness: 1, coverage: 1, robustness,
      reproducibility: 1, risk: 0, uncertainty: 0, constraintCoverage: 1, latency: latencyMs },
    evidenceVectorEvidence: { ...report.evidenceVectorEvidence, ...Object.fromEntries(dimensions.map((key) => [key, [evidenceId]])) },
    hardConstraintsPassed: true, budgetStatus: 'within', latencyMs,
    nativeProcedureVerification: { status: 'verified', methodId: 'lpt', executionRunId: run.id, evidenceId, latencyMs } } };
}

async function verifyWorld(db, world) {
  if (!proceduresOf(methodContract(world.report || {})).length) return world;
  const run = await db.get(`SELECT id, status, guardrail_reason, budget_json, metrics_json, started_at, completed_at FROM strategy_execution_runs
    WHERE agent_id = ? ORDER BY rowid DESC LIMIT 1`, world.agentId);
  return run ? audit({ world, run }) : invalid(world, 'native_lpt_execution_run_missing');
}

async function verifyReports(db, worlds) {
  return Promise.all(worlds.map((world) => verifyWorld(db, world)));
}

module.exports = { verifyReports };
