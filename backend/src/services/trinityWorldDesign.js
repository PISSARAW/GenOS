'use strict';
const factorial = require('./trinityFactorialGrid');
function expectedWorlds(selection) {
  return selection?.experimentalDesign?.worldTopology === 'factorial_grid' ? 16 : 3;
}
function expand(members) {
  if (expectedWorlds(members[0]?.variantSelection) !== 16) return members;
  const factors = { approach: ['direct', 'planned'], modelTier: ['standard', 'frontier'], validation: ['basic', 'deep'] };
  const grid = factorial.generateFactorialGrid({ factors, replications: 2, randomize: false });
  return grid.cells.map((cell, index) => cellMember({ base: members[0], cell, index }));
}
function cellMember(input) {
  const { base, cell, index } = input;
  const directive = 'FACTORIAL CELL ' + cell.cellId + ': ' + JSON.stringify(cell.factors) + '. Run this independent cell and return factorialCell {cellId, factors} exactly with measured evidence.';
  const recipe = cell.factors.approach;
  const mission = base.mission.replace(/Cognitive recipe: [a-z_]+\./g, 'Cognitive recipe: ' + recipe + '.');
  return { ...base, label: base.label + '_' + cell.cellId, worldNumber: index + 1, variantIndex: index,
    cognitiveRecipe: recipe, validationDepth: cell.factors.validation,
    modelTier: cell.factors.modelTier, role: base.role,
    factorialCell: { cellId: cell.cellId, factors: cell.factors },
    hypothesis: base.hypothesis + '\n' + directive, mission: mission + '\n' + directive
      + '\nValidation treatment: ' + cell.factors.validation + '. Report the checks actually executed; a depth label is not a receipt.' };
}
function factorialInstruction(assignment) {
  if (!assignment.factorialCell) return null;
  return 'FACTORIAL CELL ' + assignment.factorialCell.cellId + ': ' + JSON.stringify(assignment.factorialCell.factors)
    + '. Execute this independent treatment and return factorialCell exactly with measured evidence.';
}
function modelFor(member, models, index) {
  if (!member.factorialCell) return models[index % models.length];
  return models[member.factorialCell.factors.modelTier === 'frontier' ? 1 : 0];
}
function assignFactorialModels(members, models = []) {
  const pool = [...new Set(models.filter(Boolean))];
  if (pool.length < 2) return members;
  return members.map((member, index) => member.factorialCell
    ? { ...member, localModel: modelFor(member, pool, index) } : member);
}
function modelAssignments(members) {
  return members.map(member => ({ worldNumber: member.worldNumber, modelTier: member.modelTier,
    localModel: member.localModel || null, factorialCell: member.factorialCell || null }));
}
function runtimeSelection(trinity, mission) {
  return { ...trinity.variantSelection, adaptiveBudgetConfig: mission.trinityAdaptiveBudget,
    qdConfig: mission.trinityQD, sequentialConfig: mission.trinitySequential,
    workerExecutionPolicy: mission.executionPolicy, recursiveBudgetTokens: mission.trinityRecursiveBudgetTokens,
    recursiveState: { depth: Number(mission.recursiveDepth) || 0, spentBudget: Number(mission.recursiveSpentBudget) || 0, parentProblemIds: mission.recursiveParentProblemIds || [] },
    worldModelAssignments: modelAssignments(trinity.members) };
}
function workerRoute(assignment) {
  if (!assignment.localModel) return null;
  return { selectedModel: assignment.localModel, policy: { primary: assignment.localModel,
    fallbacks: [], parallelReview: [], mode: 'fallback', preferLocal: require('./modelRouter').isLocal(assignment.localModel) } };
}
module.exports = { expand, expectedWorlds, runtimeSelection, workerRoute, factorialInstruction, modelFor, modelAssignments, assignFactorialModels };
