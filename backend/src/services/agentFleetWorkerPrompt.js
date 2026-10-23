'use strict';

function formatDnaPromptBlock(dnaSelection) {
  if (!dnaSelection?.genes?.role) return null;
  const { genes } = dnaSelection;
  const parts = [`Inherited DNA phenotype — role: ${genes.role}, strategy: ${genes.strategy}.`];
  if (genes.prompt) parts.push(`DNA prompt brief: ${genes.prompt}`);
  if (Array.isArray(genes.tools) && genes.tools.length) parts.push(`DNA tools: ${genes.tools.join(', ')}.`);
  if (Array.isArray(genes.capabilities) && genes.capabilities.length) parts.push(`DNA capabilities: ${genes.capabilities.join(', ')}.`);
  return parts.join(' ');
}

function buildCompactMorphogenesisPrompt(input) {
  if (!input.enabled) return null;
  const { assignment, context, missionPrompt, workerKinds } = input;
  const contract = workerKinds.buildWorkerContract(assignment.workerKind, {
    prompt: missionPrompt, scope: context.mission.workspaceRoot,
    orchestratorAgentId: context.parent.id,
    methodContract: assignment.methodContract,
    workerAssignment: assignment.workerAssignment || assignment
  });
  const budget = context.plan.tokenPolicy.allocation === 'successive_halving_with_reallocation'
    ? `Budget round: initial screening. Use at most ${context.allocationTokens ?? context.perWorkerTokens} tokens.`
    : `Budget allocation: ${context.allocationTokens ?? context.perWorkerTokens} tokens.`;
  const workerKindInstruction = `Worker kind: ${assignment.workerKind}. Solve this in-scope Biome allocation; only abstain after exhaustive proof that no allocation exists.`;
  return [missionPrompt, input.morphogenesisRoleInstruction(assignment),
    workerKindInstruction,
    workerKinds.evidenceRule(contract), budget].filter(Boolean).join('\n');
}

module.exports = { formatDnaPromptBlock, buildCompactMorphogenesisPrompt };
