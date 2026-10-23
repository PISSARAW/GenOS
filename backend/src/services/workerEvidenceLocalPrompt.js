'use strict';

function buildAnalysisPrompt(context) {
  const { selfIntro, workerSelfBlock, conscienceBlock, workerInstruction, evidenceRule,
    codeWorker, orchestrator, agentName, prompt, workspaceContext, identityExperimentArm,
    allowedCommands } = context;
  const workerBlock = [workerInstruction, codeWorker ? codeProposalInstruction(allowedCommands) : evidenceRule]
    .filter(Boolean).join('\n');
  const intro = [selfIntro, workerSelfBlock || '', conscienceBlock, workerBlock].filter(Boolean).join('\n');
  if (codeWorker) return `${intro}\n${requiredPatchInstruction(context.requiredPatchPaths, context.requiredPatchMarkers, context.requiredPatchMinimumBytes)}\nYou are a bounded GenOS local code worker (${agentName}). Branch mission:\n${prompt}\n\nTrusted workspace snapshot:\n${workspaceContext || '[no readable workspace files]'}`;
  if (orchestrator) return `${intro}\nYou are a GenOS orchestrator (${agentName}). Mission:\n${prompt}`;
  const workerLabel = identityExperimentArm === 'llm_only' ? 'a bounded language-model worker' : 'a bounded GenOS local worker';
  return `${intro}\nYou are ${workerLabel} (${agentName}). Analyse this assigned branch. Branch mission:\n${prompt}`;
}

function requiredPatchInstruction(paths, markers, minimumBytes) {
  if (!Array.isArray(paths) || !paths.length) return '';
  const markerText = markers && Object.keys(markers).length
    ? ` Required exact content markers by path: ${JSON.stringify(markers)}.` : '';
  const sizeText = minimumBytes && Object.keys(minimumBytes).length
    ? ` Required minimum UTF-8 bytes by path: ${JSON.stringify(minimumBytes)}.` : '';
  return `The patch proposal MUST include each required path exactly once: ${JSON.stringify(paths)}.${markerText}${sizeText}`;
}

function codeProposalInstruction(allowedCommands = []) {
  const commands = [...new Set(allowedCommands.filter((command) => typeof command === 'string' && command.trim()))];
  const tests = commands.length ? [commands[0]] : ['npm test'];
  const testRule = commands.length
    ? `The tests array MUST contain exactly one command from this exact allowlist: ${JSON.stringify(commands)}. Do not substitute another command.`
    : 'Use one allow-listed test command.';
  return `Return exactly one JSON object with schema ${JSON.stringify({ format: 'genos.file-replacement/v1', patches: [{ path: 'src/file.ext', content: 'complete file content' }], tests, evidence: 'reason for the change' })}. Use 1-12 patches. ${testRule} Do not add keys or prose. Never claim a test passed unless the worker executes it.`;
}

function isCodeWorkerMission(mission) {
  const explicitlyEnabled = mission.localCodeWorker === true
    || mission.executionPolicy?.localCodeWorker === true;
  const codeRole = /^(implementation|coder|developer|basic_implementation|interview_plan_implementation|self_correcting_implementation)$/i
    .test(String(mission.role || '').trim());
  const boundedCodeKind = mission.workerKind === 'bounded_worker';
  return (explicitlyEnabled || process.env.GENOS_ALLOW_LOCAL_CODE_WORKERS === '1')
    && (codeRole || boundedCodeKind);
}

module.exports = { buildAnalysisPrompt, isCodeWorkerMission };
