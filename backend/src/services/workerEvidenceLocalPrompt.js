'use strict';

function buildAnalysisPrompt(context) {
  const { selfIntro, workerSelfBlock, conscienceBlock, workerInstruction, evidenceRule,
    codeWorker, orchestrator, agentName, prompt, workspaceContext } = context;
  const workerBlock = [workerInstruction, codeWorker ? codeProposalInstruction() : evidenceRule].filter(Boolean).join('\n');
  const intro = [selfIntro, workerSelfBlock || '', conscienceBlock, workerBlock].filter(Boolean).join('\n');
  if (codeWorker) return `${intro}\nYou are a bounded GenOS local code worker (${agentName}). Branch mission:\n${prompt}\n\nTrusted workspace snapshot:\n${workspaceContext || '[no readable workspace files]'}`;
  if (orchestrator) return `${intro}\nYou are a GenOS orchestrator (${agentName}). Mission:\n${prompt}`;
  return `${intro}\nYou are a bounded GenOS local worker (${agentName}). Analyse this assigned branch. Branch mission:\n${prompt}`;
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

module.exports = { buildAnalysisPrompt, isCodeWorkerMission };
