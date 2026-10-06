'use strict';
function evaluate(worlds, assignments = []) {
  if (worlds.length !== 16 || assignments.length !== 16) return { valid: false, reason: 'factorial_treatment_count_missing' };
  if (!worlds.every(world => validCell(world, assignments.find(item => item.worldNumber === world.worldNumber)))) {
    return { valid: false, reason: 'factorial_treatment_provenance_missing' };
  }
  const levels = ['standard', 'frontier'].map(level => new Set(assignments.filter(item => item.modelTier === level).map(item => item.localModel)));
  const valid = levels.every(models => models.size === 1) && [...levels[0]][0] !== [...levels[1]][0];
  return { valid, reason: valid ? null : 'factorial_model_levels_not_distinct', decisionAuthority: 'none' };
}
function validCell(world, assignment) {
  const expected = assignment?.factorialCell, actual = world.report?.factorialCell;
  if (!expected || !actual || actual.cellId !== expected.cellId) return false;
  if (!sameFactors(expected.factors, actual.factors)) return false;
  return Boolean(assignment.localModel && world.runtimeProvenance?.source === 'runtime_completion_event'
    && world.runtimeProvenance.model === assignment.localModel);
}
function sameFactors(expected, actual) {
  if (!expected || !actual) return false;
  const keys = Object.keys(expected);
  return Object.keys(actual).length === keys.length && keys.every(key => expected[key] === actual[key]);
}
module.exports = { evaluate };
