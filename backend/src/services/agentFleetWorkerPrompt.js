'use strict';

function formatDnaPromptBlock(dnaSelection, context = {}) {
  if (!dnaSelection?.genes?.role) return null;
  const { genes } = dnaSelection;
  const assignmentRole = normalize(context.workerSelf?.workerRole || context.assignment?.role);
  const parts = [assignmentRole === normalize(genes.role)
    ? `Inherited DNA strategy: ${genes.strategy}.`
    : `Inherited DNA phenotype — role: ${genes.role}, strategy: ${genes.strategy}.`];
  if (genes.prompt && !isDuplicateText(genes.prompt, duplicateSources(context))) {
    parts.push(`DNA prompt brief: ${genes.prompt}`);
  }
  const tools = uniqueInheritedItems(genes.tools, [context.workerSelf?.operational?.tools]);
  const capabilities = uniqueInheritedItems(genes.capabilities, [context.assignment?.capabilities]);
  if (tools.length) parts.push(`DNA tools: ${tools.join(', ')}.`);
  if (capabilities.length) parts.push(`DNA capabilities: ${capabilities.join(', ')}.`);
  return parts.join(' ');
}

function duplicateSources(context) {
  return [context.missionPrompt, context.assignment?.hypothesis,
    ...(context.workerSelf?.lessons || []).flatMap((lesson) => [lesson.claim, lesson.id])];
}

function formatWorkerHypothesis(assignment, context = {}) {
  if (!assignment?.hypothesis || isDuplicateText(assignment.hypothesis, [
    context.missionPrompt, ...(context.workerSelf?.lessons || []).map((lesson) => lesson.claim)
  ])) return null;
  return `Hypothesis: ${assignment.hypothesis}`;
}

function formatAssignmentBranch(assignment) {
  if (!assignment?.label || normalize(assignment.label) === normalize(assignment.role)) return null;
  return `Assigned branch: ${assignment.label}.`;
}

function formatDistinctFactorialInstruction(assignment) {
  const instruction = require('./trinityWorldDesign').factorialInstruction(assignment);
  const cell = assignment?.factorialCell;
  const marker = cell && `FACTORIAL CELL ${cell.cellId}: ${JSON.stringify(cell.factors)}`;
  const hypothesis = normalizeText(assignment?.hypothesis);
  return marker && hypothesis.includes(normalizeText(marker)) && hypothesis.includes('factorialcell')
    ? null : instruction;
}

function buildAssignmentPromptBlocks(input) {
  const { assignment, workerSelf, dnaSelection, missionPrompt } = input;
  return {
    dna: formatDnaPromptBlock(dnaSelection, { assignment, workerSelf, missionPrompt }),
    branch: formatAssignmentBranch(assignment),
    hypothesis: formatWorkerHypothesis(assignment, { missionPrompt, workerSelf }),
    factorial: formatDistinctFactorialInstruction(assignment)
  };
}

function isDuplicateText(value, sources) {
  const candidate = normalizeText(value);
  return Boolean(candidate && sources.some((source) => normalizeText(source) === candidate));
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
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

module.exports = { formatDnaPromptBlock, formatWorkerHypothesis, formatAssignmentBranch,
  formatDistinctFactorialInstruction, buildAssignmentPromptBlocks, buildCompactMorphogenesisPrompt };
