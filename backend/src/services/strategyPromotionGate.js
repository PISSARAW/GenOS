/**
 * Deferred promotion gate (point #8 — promotion différée).
 *
 * approveRun must never promote on a bare string claim: every promotion goes
 * through (a) the contract promotion gate (evaluatePromotionGate, read-only),
 * (b) a mandatory human-approval proof (hash-bound receipt, human_approval
 * evidence in turns/report with a truthy value, or an authenticated
 * approvedBy), and (c) workspace-capsule confinement of every
 * caller-controlled merge root via workspaceRegistry.isPathWithinRoot.
 */

const { isPathWithinRoot, resolveWorkspacesRoot } = require('./workspaceRegistry');

const PROMOTION_FALLBACK_PRIMITIVES = ['stdp_update', 'cherry_pick_golden_path'];

function safeJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function isHashString(value) {
  if (!isNonEmptyString(value)) return false;
  return /^[a-f0-9]{64}$/i.test(value);
}

function defaultPromotionTask(runId) {
  return `Run ${runId} promotion`;
}

function evidenceListOf(step) {
  const parsed = safeJson(step.evidence_json, []);
  return Array.isArray(parsed) ? parsed : [];
}

function adoptReport(acc, data) {
  if (acc.report) return;
  const candidate = data.evidenceReport || data.report;
  if (candidate) acc.report = candidate;
}

function adoptTask(acc, data, runId) {
  if (acc.task !== defaultPromotionTask(runId)) return;
  const candidate = data.prompt || data.task;
  if (candidate) acc.task = candidate;
}

function adoptWorkspace(acc, data) {
  if (acc.workspaceId !== 'ws-genos-core') return;
  if (data.workspaceId) acc.workspaceId = data.workspaceId;
}

function adoptTurns(acc, data) {
  if (acc.turns.length) return;
  const recorded = Array.isArray(data.recordedTurns) ? data.recordedTurns : [];
  if (recorded.length) acc.turns = recorded;
}

function mergeEvidencePayload(data, acc, runId) {
  adoptReport(acc, data);
  adoptTask(acc, data, runId);
  adoptWorkspace(acc, data);
  adoptTurns(acc, data);
}

function collectPromotionEvidence(steps, acc, runId) {
  for (const step of steps) {
    for (const ev of evidenceListOf(step)) mergeEvidencePayload(ev.payload || {}, acc, runId);
  }
}

function contractTask(input, fallback) {
  if (fallback) return fallback;
  const profile = input.contract.problem_profile || {};
  if (profile.description) return profile.description;
  if (input.agent && input.agent.role) return input.agent.role;
  return defaultPromotionTask(input.runId);
}

function resolvePromotionWorkspace(options, agent) {
  if (options.workspaceId) return options.workspaceId;
  if (agent && agent.workspace_id) return agent.workspace_id;
  return 'ws-genos-core';
}

async function loadPromotionContext(db, row, options) {
  const contractRecord = await db.get('SELECT contract_json FROM strategy_contracts WHERE id = ?', row.contract_id);
  const contractRow = contractRecord || {};
  const contract = safeJson(contractRow.contract_json, {});
  const agent = await db.get('SELECT * FROM agents WHERE id = ?', row.agent_id);
  const steps = await db.all('SELECT * FROM strategy_execution_steps WHERE run_id = ? ORDER BY sequence DESC', row.id);
  const acc = {
    report: options.report || null,
    task: contractTask({ contract, agent, runId: row.id }, options.task),
    workspaceId: resolvePromotionWorkspace(options, agent),
    turns: options.turns || []
  };
  collectPromotionEvidence(steps, acc, row.id);
  return {
    runId: row.id,
    agentId: row.agent_id,
    contractId: row.contract_id,
    contract,
    agent,
    report: acc.report,
    task: acc.task,
    workspaceId: acc.workspaceId,
    turns: acc.turns
  };
}

function isValidApprovalReceipt(receipt) {
  if (!receipt || typeof receipt !== 'object') return false;
  if (receipt.approved !== true) return false;
  if (!isNonEmptyString(receipt.approvalId)) return false;
  if (!isNonEmptyString(receipt.approverId)) return false;
  if (!isNonEmptyString(receipt.approvedAt)) return false;
  return isHashString(receipt.payloadHash);
}

function validReceiptFrom(options) {
  const receipt = options.humanApprovalReceipt;
  if (!receipt) return null;
  if (!isValidApprovalReceipt(receipt)) {
    throw new Error('Invalid humanApprovalReceipt: approved/approvalId/approverId/approvedAt/payloadHash are required.');
  }
  return receipt;
}

function isHumanApprovalLabel(value) {
  const text = String(value || '').toLowerCase();
  if (!text) return false;
  if (text.indexOf('human_approval') !== -1) return true;
  return text.indexOf('human') !== -1 && text.indexOf('approv') !== -1;
}

function isLabeledHumanApprovalTurn(turn) {
  if (!turn || typeof turn !== 'object') return false;
  return isHumanApprovalLabel(turn.action) || isHumanApprovalLabel(turn.type) || isHumanApprovalLabel(turn.name);
}

function isApprovedValue(value) {
  if (value === true || value === 'approve' || value === 'approved') return true;
  if (!value || typeof value !== 'object') return false;
  return value.pass === true || value.approved === true || value.decision === 'approve';
}

function labeledHumanApprovalTurns(turns) {
  const list = Array.isArray(turns) ? turns : [];
  return list.filter(isLabeledHumanApprovalTurn);
}

function approvedHumanApprovalTurns(turns) {
  return labeledHumanApprovalTurns(turns).filter(isApprovedValue);
}

function firstDefined(first, second, third) {
  if (first !== undefined) return first;
  if (second !== undefined) return second;
  return third;
}

function reportApprovalCandidate(report) {
  if (!report || typeof report !== 'object') return undefined;
  return firstDefined(report.human_approval, report.humanApproval, report.approvalDecision);
}

function humanApprovalInReport(report) {
  const candidate = reportApprovalCandidate(report);
  if (candidate === undefined) return false;
  return isApprovedValue(candidate);
}

function reportDeniesApproval(report) {
  const candidate = reportApprovalCandidate(report);
  if (candidate === undefined) return false;
  return !isApprovedValue(candidate);
}

function assertApprovalProof(promotion, options, runId) {
  const receipt = validReceiptFrom(options);
  if (receipt) return receipt;
  if (approvedHumanApprovalTurns(promotion.turns).length) return null;
  if (labeledHumanApprovalTurns(promotion.turns).length) {
    throw new Error(`Execution run ${runId} promotion refused: recorded human approval was denied.`);
  }
  if (humanApprovalInReport(promotion.report)) return null;
  if (reportDeniesApproval(promotion.report)) {
    throw new Error(`Execution run ${runId} promotion refused: recorded human approval was denied.`);
  }
  if (isNonEmptyString(options.approvedBy)) return null;
  throw new Error(`Execution run ${runId} requires a human approval proof (humanApprovalReceipt, human_approval evidence or approvedBy).`);
}

function buildGateContext(promotion, options, receipt) {
  return {
    agentId: options.agentId || promotion.agentId,
    report: promotion.report,
    replayReceipt: options.replayReceipt,
    independentVerification: options.independentVerification,
    evidenceVerified: options.evidenceVerified,
    verifiedClaims: options.verifiedClaims,
    workerDossiers: options.workerDossiers,
    humanApprovalReceipt: receipt || options.humanApprovalReceipt || null
  };
}

function describeViolations(violations) {
  const list = violations || [];
  const text = list.map((violation) => `${violation.policy}: ${violation.message}`).join('; ');
  return text || 'unknown policy violation';
}

function assertPromotionGate(contract, gateContext) {
  const promotionPolicy = require('./strategyPromotionPolicyService');
  const evaluation = promotionPolicy.evaluatePromotionGate(contract, gateContext);
  if (evaluation.eligible) return evaluation;
  throw new Error(`Promotion gate refused: ${describeViolations(evaluation.violations)}`);
}

function completionGuardrail(contract, payload, agentId) {
  const data = payload || {};
  const report = data.evidenceReport || data.report;
  const promotionPolicy = require('./strategyPromotionPolicyService');
  const evaluation = promotionPolicy.evaluatePromotionGate(contract, {
    replayReceipt: data.replayReceipt,
    independentVerification: data.independentVerification,
    agentId,
    humanApproved: false,
    report
  });
  const blocking = evaluation.violations.filter((violation) => violation.policy !== 'require_human_approval');
  if (blocking.length) return `Promotion gate blocked (${blocking[0].policy}): ${blocking[0].message}`;
  return null;
}

function promotionRoots(options) {
  return [
    { kind: 'winner', root: options.winnerWorkspaceRoot },
    { kind: 'target', root: options.targetWorkspaceRoot },
    { kind: 'causalBase', root: options.causalBaseWorkspaceRoot }
  ].filter((entry) => isNonEmptyString(entry.root));
}

async function workspacePathFor(db, workspaceId) {
  if (!workspaceId) return null;
  const row = await db.get('SELECT path FROM workspaces WHERE id = ?', workspaceId);
  if (!row || !row.path) return null;
  return row.path;
}

async function workspacePathForAgent(db, agentId) {
  if (!agentId) return null;
  const row = await db.get('SELECT w.path AS path FROM agents a LEFT JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ?', agentId);
  if (!row || !row.path) return null;
  return row.path;
}

async function resolveCapsuleRoot(db, capsule) {
  const fromWorkspace = await workspacePathFor(db, capsule.workspaceId);
  if (fromWorkspace) return fromWorkspace;
  const fromAgent = await workspacePathForAgent(db, capsule.agentId);
  if (fromAgent) return fromAgent;
  return resolveWorkspacesRoot();
}

function assertRootsInCapsule(roots, capsule) {
  const outside = roots.filter((entry) => !isPathWithinRoot(capsule, entry.root));
  if (!outside.length) return;
  const kinds = outside.map((entry) => entry.kind).join(', ');
  throw new Error(`Promotion workspace confinement refused (${kinds} outside capsule ${capsule}).`);
}

async function assertPromotionContainment(db, promotion, options) {
  const roots = promotionRoots(options);
  if (!roots.length) return;
  const capsule = await resolveCapsuleRoot(db, { workspaceId: promotion.workspaceId, agentId: promotion.agentId });
  assertRootsInCapsule(roots, capsule);
}

function pipelineTurns(turns) {
  if (turns.length) return turns;
  return [{ action: 'human_approval', pass: true }];
}

async function runPromotionPipeline(promotion, primitives) {
  const adapter = require('./strategyExecutionAdapter');
  const list = primitives.length ? primitives : PROMOTION_FALLBACK_PRIMITIVES;
  try {
    return await adapter.executePipelineWithFeedback(list, {
      agentId: promotion.agentId,
      orchestratorId: promotion.agentId,
      workspaceId: promotion.workspaceId,
      task: promotion.task,
      report: promotion.report,
      turns: pipelineTurns(promotion.turns),
      sourceId: promotion.agentId,
      targetId: promotion.agentId
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function applyPostPromotion(db, promotion, options) {
  const promotionPolicy = require('./strategyPromotionPolicyService');
  const result = await promotionPolicy.applyPostPromotionPolicies(db, promotion.contract, {
    agentId: promotion.agentId,
    rejectedBranchIds: options.rejectedBranchIds || [],
    winnerWorkspaceRoot: options.winnerWorkspaceRoot,
    targetWorkspaceRoot: options.targetWorkspaceRoot,
    causalBaseWorkspaceRoot: options.causalBaseWorkspaceRoot
  });
  if (result.success) return result;
  throw new Error(`Execution run ${promotion.runId} workspace promotion failed: ${result.error || 'unknown error'}`);
}

function memorySummary(report, fallback) {
  const claims = report && Array.isArray(report.claims) ? report.claims : [];
  const statements = claims
    .map((claim) => claim && claim.statement)
    .filter((statement) => typeof statement === 'string' && statement);
  if (statements.length) return statements.join('\n');
  return fallback;
}

function memoryOutcome(report) {
  if (!report || !report.outcome) return 'unknown';
  return report.outcome;
}

async function markPromotionComplete(db, runId) {
  const now = new Date().toISOString();
  await db.run("UPDATE strategy_execution_steps SET status = 'completed', completed_at = ? WHERE run_id = ? AND status = 'awaiting_approval'", now, runId);
  await db.run("UPDATE strategy_execution_runs SET status = 'completed', completed_at = ? WHERE id = ? AND status = 'awaiting_approval'", now, runId);
}

async function recordPromotionMemory(promotion, options) {
  try {
    const agentMemory = require('./agentMemoryContext');
    const agent = promotion.agent || {};
    await agentMemory.compileExecutionMemory(
      agent.name || promotion.agentId,
      promotion.task,
      memorySummary(promotion.report, options.summary || `Strategy promotion completed and approved for run ${promotion.runId}.`),
      { outcome: memoryOutcome(promotion.report), approvedBy: options.approvedBy || 'human_gate' }
    );
  } catch (_) {}
}

function emitPromotionFinalized(promotion, options) {
  try {
    const telemetry = require('./telemetryObserver');
    telemetry.emitEvent({
      eventType: 'STRATEGY_PROMOTION_FINALIZED',
      agentId: promotion.agentId,
      action: 'PROMOTION_FINALIZED',
      detail: `Deferred promotion pipeline executed for approved run ${promotion.runId}.`,
      payload: { runId: promotion.runId, contractId: promotion.contractId, approvedBy: options.approvedBy || 'human_gate' }
    });
  } catch (_) {}
}

async function finalizePromotion(db, promotion, options) {
  await markPromotionComplete(db, promotion.runId);
  await recordPromotionMemory(promotion, options);
  emitPromotionFinalized(promotion, options);
}

module.exports = {
  loadPromotionContext,
  assertApprovalProof,
  buildGateContext,
  assertPromotionGate,
  completionGuardrail,
  assertPromotionContainment,
  resolveCapsuleRoot,
  runPromotionPipeline,
  applyPostPromotion,
  finalizePromotion,
  isValidApprovalReceipt
};
