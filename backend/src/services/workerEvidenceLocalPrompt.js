'use strict';

function buildAnalysisPrompt(context) {
  const { selfIntro, workerSelfBlock, conscienceBlock, workerInstruction, evidenceRule,
    codeWorker, orchestrator, agentName, prompt, workspaceContext, identityExperimentArm } = context;
  const morphogenesisPrompt = require('./morphogenesisRolePrompt');
  const assignment = context.assignment || {};
  const workerBlock = [workerInstruction, codeWorker ? codeProposalInstruction() : evidenceRule].filter(Boolean).join('\n');
  if (!codeWorker && morphogenesisPrompt.morphogenesisCompactWorkerRole(assignment)) {
    return [morphogenesisPrompt.morphogenesisMissionPrompt(assignment, prompt),
      morphogenesisPrompt.morphogenesisRoleInstruction(assignment), workerBlock].filter(Boolean).join('\n');
  }
  const intro = [selfIntro, workerSelfBlock || '', conscienceBlock, workerBlock].filter(Boolean).join('\n');
  if (codeWorker) return `${intro}\n${requiredPatchInstruction(context.requiredPatchPaths, context.requiredPatchMarkers, context.requiredPatchMinimumBytes)}\nYou are a bounded GenOS local code worker (${agentName}). Branch mission:\n${prompt}\n\nTrusted workspace snapshot:\n${workspaceContext || '[no readable workspace files]'}`;
  if (orchestrator) return `${intro}\nYou are a GenOS orchestrator (${agentName}). Mission:\n${prompt}`;
  const workerLabel = identityExperimentArm === 'llm_only' ? 'a bounded language-model worker' : 'a bounded GenOS local worker';
  return `${intro}\nYou are ${workerLabel} (${agentName}). Analyse this assigned branch. Branch mission:\n${prompt}`;
}

function sourceReferenceInstruction(mission) {
  const refs = [...new Set(['mission', ...(mission.allowedEvidenceRefs || mission.evidenceRefs || [])]
    .filter((item) => typeof item === 'string' && item.trim()))];
  if (require('./morphogenesisRolePrompt').morphogenesisCompactWorkerRole(mission)) {
    return `Use only these exact evidence references: ${JSON.stringify(refs)}. The mission reference supplies all allocation facts. Return unresolved only after exhaustive search proves no valid allocation exists.`;
  }
  return `Use only these exact evidence references: ${JSON.stringify(refs)}. `
    + 'Never invent source IDs, receipts, measurements, file changes, tests, or completed steps. '
    + 'If these references cannot substantiate the requested outcome, return outcome "unresolved".';
}

function requiredPatchInstruction(paths, markers, minimumBytes) {
  if (!Array.isArray(paths) || !paths.length) return '';
  const markerText = markers && Object.keys(markers).length
    ? ` Required exact content markers by path: ${JSON.stringify(markers)}.` : '';
  const sizeText = minimumBytes && Object.keys(minimumBytes).length
    ? ` Required minimum UTF-8 bytes by path: ${JSON.stringify(minimumBytes)}.` : '';
  return `The patch proposal MUST include each required path exactly once: ${JSON.stringify(paths)}.${markerText}${sizeText}`;
}

function codeProposalInstruction() {
  return 'Return exactly one JSON object with schema {"format":"genos.file-replacement/v1","patches":[{"path":"src/file.ext","content":"complete file content"}],"tests":["npm test"],"evidence":"reason for the change"}. Use 1-12 patches and 1-2 allow-listed test commands (npm test, npm run check, pytest, or cargo test with supported options). Do not add keys or prose. Never claim a test passed unless the worker executes it.';
}

function isCodeWorkerMission(mission) {
  const explicitlyEnabled = mission.localCodeWorker === true
    || mission.executionPolicy?.localCodeWorker === true;
  return (explicitlyEnabled || process.env.GENOS_ALLOW_LOCAL_CODE_WORKERS === '1')
    && /implementation|coder|developer/i.test(mission.role || '');
}

module.exports = { buildAnalysisPrompt, isCodeWorkerMission, sourceReferenceInstruction };
