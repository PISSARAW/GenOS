'use strict';

function runGenerationStageRule1(context) {
  return context.codeWorker
    ? context.require('../../bin/local-codex-runtime.cjs').buildWorkspaceContext(context.ctx.mission.workspaceRoot, {
      allowedCommands: context.ctx.mission.allowedCommands || context.ctx.mission.executionPolicy?.allowedCommands || []
    }) : { text: '', candidatePaths: [] };
}

function runGenerationStageRule2(context) {
  return require('./workerLocalStageDetails').outputCap(context.ctx.mission);
}

function runGenerationStageRule3(context) {
  return {
        ...context.identityExperimentAudit,
        identityExperimentScenario: context.ctx.mission.identityExperimentScenario || null,
        identityExperimentSeed: context.Number.isInteger(context.ctx.mission.identityExperimentSeed) ? context.ctx.mission.identityExperimentSeed : null,
        allowedEvidenceRefs: context.require('./workerEvidenceIdentityPrompt').missionEvidenceRefs(context.ctx.mission),
        promptText: context.promptText,
        promptSha256: context.require('./identityExperimentPromptTreatment').promptSha256(context.promptText),
        promptCharacters: context.promptText.length
      };
}

function runGenerationStageRule4(context) {
  return {
    assignment: context.ctx.mission,
    codeWorker: context.codeWorker,
    requiredPatchPaths: context.ctx.mission.requiredPatchPaths,
    requiredPatchMarkers: context.ctx.mission.requiredPatchMarkers,
    requiredPatchMinimumBytes: context.ctx.mission.requiredPatchMinimumBytes,
    allowedCommands: context.ctx.mission.executionPolicy?.allowedCommands || [],
    forceFullFileReplacement: context.ctx.mission.forceFullFileReplacement === true,

    orchestrator: context.isOrchestratorMission(context.ctx.mission),
    selfIntro: context.selfIntro,
    conscienceBlock: context.conscienceBlock,
    agentName: context.agentName,
    prompt: context.ctx.mission.prompt,
    workerSelfBlock: context.wsBlock,
    identityExperimentArm: context.experimentArm || null,
    workspaceContext: context.workspaceContext,
    workerInstruction: [`Worker kind: ${context.kind}. ${context.require('./morphogenesisRolePrompt').morphogenesisCompactWorkerRole(context.ctx.mission)
      ? 'Solve the assigned in-scope allocation; only abstain after exhaustive proof no solution exists.'
      : context.workerKinds.promptRule(context.kind)}${context.ctx.mission.methodContract ? ` Method contract: ${context.JSON.stringify(context.ctx.mission.methodContract)}.` : ''}`,
      context.require('./workerEvidenceIdentityPrompt').sourceReferenceInstruction(context.ctx.mission)].filter(context.Boolean).join(' '),
    evidenceRule: context.workerKinds.evidenceRule(context.workerContract)
  };
}

module.exports = { runGenerationStageRule1, runGenerationStageRule2, runGenerationStageRule3, runGenerationStageRule4 };
