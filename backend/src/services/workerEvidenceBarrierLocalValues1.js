'use strict';

function runGenerationStageValue1(__genosValueScope1) {
  return __genosValueScope1.codeWorker
    ? (0, __genosValueScope1.require)('../../bin/local-codex-runtime.cjs').buildWorkspaceContext(__genosValueScope1.ctx.mission.workspaceRoot, {
      allowedCommands: __genosValueScope1.ctx.mission.allowedCommands || __genosValueScope1.ctx.mission.executionPolicy?.allowedCommands || []
    }) : { text: '', candidatePaths: [] };
}

function runGenerationStageValue2(__genosValueScope2) {
  return __genosValueScope2.ctx.mission.workerKind === 'resource_steward' ? 768
      : (__genosValueScope2.ctx.mission.identityExperimentScenario ? 1024 : __genosValueScope2.undefined);
}

function runGenerationStageValue3(__genosValueScope3) {
  return {
        ...__genosValueScope3.identityExperimentAudit,
        identityExperimentScenario: __genosValueScope3.ctx.mission.identityExperimentScenario || null,
        identityExperimentSeed: __genosValueScope3.Number.isInteger(__genosValueScope3.ctx.mission.identityExperimentSeed) ? __genosValueScope3.ctx.mission.identityExperimentSeed : null,
        allowedEvidenceRefs: (0, __genosValueScope3.require)('./workerEvidenceIdentityPrompt').missionEvidenceRefs(__genosValueScope3.ctx.mission),
        promptText: __genosValueScope3.promptText,
        promptSha256: (0, __genosValueScope3.require)('./identityExperimentPromptTreatment').promptSha256(__genosValueScope3.promptText),
        promptCharacters: __genosValueScope3.promptText.length
      };
}

function runGenerationStageValue4(__genosValueScope4) {
  return {
    assignment: __genosValueScope4.ctx.mission,
    codeWorker: __genosValueScope4.codeWorker,
    requiredPatchPaths: __genosValueScope4.ctx.mission.requiredPatchPaths,
    requiredPatchMarkers: __genosValueScope4.ctx.mission.requiredPatchMarkers,
    requiredPatchMinimumBytes: __genosValueScope4.ctx.mission.requiredPatchMinimumBytes,
    allowedCommands: __genosValueScope4.ctx.mission.executionPolicy?.allowedCommands || [],
    forceFullFileReplacement: __genosValueScope4.ctx.mission.forceFullFileReplacement === true,

    orchestrator: (0, __genosValueScope4.isOrchestratorMission)(__genosValueScope4.ctx.mission),
    selfIntro: __genosValueScope4.selfIntro,
    conscienceBlock: __genosValueScope4.conscienceBlock,
    agentName: __genosValueScope4.agentName,
    prompt: __genosValueScope4.ctx.mission.prompt,
    workerSelfBlock: __genosValueScope4.wsBlock,
    identityExperimentArm: __genosValueScope4.experimentArm || null,
    workspaceContext: __genosValueScope4.workspaceContext,
    workerInstruction: [`Worker kind: ${__genosValueScope4.kind}. ${(0, __genosValueScope4.require)('./morphogenesisRolePrompt').morphogenesisCompactWorkerRole(__genosValueScope4.ctx.mission)
      ? 'Solve the assigned in-scope allocation; only abstain after exhaustive proof no solution exists.'
      : __genosValueScope4.workerKinds.promptRule(__genosValueScope4.kind)}${__genosValueScope4.ctx.mission.methodContract ? ` Method contract: ${__genosValueScope4.JSON.stringify(__genosValueScope4.ctx.mission.methodContract)}.` : ''}`,
      (0, __genosValueScope4.require)('./workerEvidenceIdentityPrompt').sourceReferenceInstruction(__genosValueScope4.ctx.mission)].filter(__genosValueScope4.Boolean).join(' '),
    evidenceRule: __genosValueScope4.workerKinds.evidenceRule(__genosValueScope4.workerContract)
  };
}

module.exports = { runGenerationStageValue1, runGenerationStageValue2, runGenerationStageValue3, runGenerationStageValue4 };
