'use strict';

function treatment(mission, details) {
  if (!mission.identityExperimentArm) return { ...details, audit: null };
  const result = require('./identityExperimentPromptTreatment').applyIdentityExperimentTreatment({
    arm: mission.identityExperimentArm, agentId: mission.agentId, agentName: details.agentName,
    role: mission.role, selfIntro: details.selfIntro, conscienceBlock: details.conscienceBlock,
    workerSelfBlock: details.wsBlock });
  return { ...details, selfIntro: result.selfIntro, conscienceBlock: result.conscienceBlock,
    wsBlock: result.workerSelfBlock, audit: result.audit };
}

function workspace(mission, codeWorker) {
  if (!codeWorker) return require('./workerEvidenceReadOnlyWorkspace').buildReadOnlyWorkspaceContext(mission);
  const context = require('../../bin/local-codex-runtime.cjs').buildWorkspaceContext(mission.workspaceRoot, {
    allowedCommands: mission.allowedCommands || mission.executionPolicy?.allowedCommands || [] });
  mission.allowedPatchPaths = context.patchCandidatePaths.filter(candidate => require('./localCodeWorkerService').safePath(candidate));
  return context.text;
}

function workerInstruction(mission, kind) {
  const rule = require('./morphogenesisRolePrompt').morphogenesisCompactWorkerRole(mission)
    ? 'Solve the assigned in-scope allocation; only abstain after exhaustive proof no solution exists.'
    : require('./agents/workerKindService').promptRule(kind);
  const method = mission.methodContract ? ` Method contract: ${JSON.stringify(mission.methodContract)}.` : '';
  return [`Worker kind: ${kind}. ${rule}${method}`,
    require('./workerEvidenceIdentityPrompt').sourceReferenceInstruction(mission)].filter(Boolean).join(' ');
}

function outputCap(mission) {
  if (mission.workerKind === 'resource_steward') return 768;
  return mission.identityExperimentScenario ? 1024 : undefined;
}

async function recordAudit(ctx, input) {
  const audit = input.audit;
  if (!audit) return;
  const { emit } = require('./agentOrchestrationState');
  const event = emit(ctx.mission.agentId, 'IDENTITY_EXPERIMENT_PROMPT', 'PROMPT_TREATMENT',
    `Applied identity experiment arm ${audit.arm}.`, { ...audit,
      identityExperimentScenario: ctx.mission.identityExperimentScenario || null,
      identityExperimentSeed: Number.isInteger(ctx.mission.identityExperimentSeed) ? ctx.mission.identityExperimentSeed : null,
      allowedEvidenceRefs: require('./workerEvidenceIdentityPrompt').missionEvidenceRefs(ctx.mission),
      promptText: input.promptText,
      promptSha256: require('./identityExperimentPromptTreatment').promptSha256(input.promptText),
      promptCharacters: input.promptText.length }, 'info', 'running');
  await require('./strategyExecutionService').recordExecutionEvent(ctx.db, ctx.mission.agentId, event);
}

async function proposal(ctx) {
  return require('./workerEvidenceBarrierLocalProposal').resolveProposal({ codeWorker: ctx.codeWorker,
    result: ctx.result, workspaceRoot: ctx.mission.workspaceRoot, text: ctx.result.text,
    allowedCommands: ctx.mission.executionPolicy?.allowedCommands || [],
    requiredPatchPaths: ctx.mission.requiredPatchPaths, allowedPatchPaths: ctx.mission.allowedPatchPaths,
    requiredPatchMarkers: ctx.mission.requiredPatchMarkers, requiredPatchMinimumBytes: ctx.mission.requiredPatchMinimumBytes,
    db: ctx.db, mission: ctx.mission, executionRun: ctx.executionRun });
}

function validateArtifact(ctx, evidenceReport, proposalResult) {
  const startedAt = Date.now();
  try { require('./workerEvidenceLocalArtifact').attachWorkerArtifact(evidenceReport, { ...ctx, proposal: proposalResult }); }
  finally { ctx.stageTimings.artifactValidationMs = Date.now() - startedAt; }
  const validation = require('./morphogenesisRolePrompt').validateBiomeAllocation(
    evidenceReport.claims?.[0]?.statement, ctx.mission.prompt,
    { ...ctx.mission, ...(ctx.mission.workerAssignment || {}) });
  if (validation && !validation.passed) throw require('./morphogenesis/biomeAllocationFeedback')
    .allocationFailure(evidenceReport.claims?.[0]?.statement, validation.issues);
}

module.exports = { treatment, workspace, workerInstruction, outputCap, recordAudit, proposal, validateArtifact };
