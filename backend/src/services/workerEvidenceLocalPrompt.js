'use strict';

function buildAnalysisPrompt(context) {
  const { selfIntro, workerSelfBlock, conscienceBlock, workerInstruction, evidenceRule, codeWorker, orchestrator, agentName, prompt } = context;
  const workerBlock = [workerInstruction, evidenceRule].filter(Boolean).join('\n');
  const intro = [selfIntro, workerSelfBlock || '', conscienceBlock, workerBlock].filter(Boolean).join('\n');
  if (codeWorker) return `${intro}\nYou are a bounded GenOS local code worker (${agentName}). Return only strict JSON. Branch mission:\n${prompt}`;
  if (orchestrator) return `${intro}\nYou are a GenOS orchestrator (${agentName}). Mission:\n${prompt}`;
  return `${intro}\nYou are a bounded GenOS local worker (${agentName}). Analyse this assigned branch. Branch mission:\n${prompt}`;
}

function isCodeWorkerMission(mission) {
  return process.env.GENOS_ALLOW_LOCAL_CODE_WORKERS === '1'
    && /implementation|coder|developer/i.test(mission.role || '');
}

module.exports = { buildAnalysisPrompt, isCodeWorkerMission };
