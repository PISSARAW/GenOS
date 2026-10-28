'use strict';

function formatDnaPromptBlock(dnaSelection, context = {}) {
  if (!dnaSelection?.genes?.role) return null;
  const { genes } = dnaSelection;
  const assignmentRole = normalize(context.assignment?.role);
  const parts = [assignmentRole === normalize(genes.role)
    ? `Inherited DNA strategy: ${genes.strategy}.`
    : `Inherited DNA phenotype — role: ${genes.role}, strategy: ${genes.strategy}.`];
  if (genes.prompt) parts.push(`DNA prompt brief: ${genes.prompt}`);
  const tools = uniqueInheritedItems(genes.tools, [context.workerSelf?.operational?.tools]);
  const capabilities = uniqueInheritedItems(genes.capabilities, [context.assignment?.capabilities]);
  if (tools.length) parts.push(`DNA tools: ${tools.join(', ')}.`);
  if (capabilities.length) parts.push(`DNA capabilities: ${capabilities.join(', ')}.`);
  return parts.join(' ');
}

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function uniqueInheritedItems(items, existingLists) {
  if (!Array.isArray(items)) return [];
  const existing = new Set(existingLists.flatMap((list) => Array.isArray(list) ? list : [])
    .map(normalize).filter(Boolean));
  return [...new Set(items.map((item) => String(item).trim()).filter(Boolean))]
    .filter((item) => !existing.has(normalize(item)));
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
