'use strict';
const { fail } = require('./qualityContract');

function wordTarget(contract, plan, scene) {
  const uniform = contract.minBodyWords / plan.scenes.length;
  const selected = plan.scenes.find(item => item.id === scene?.id);
  const timed = plan.scenes.every(item => Number.isFinite(item.plannedMinutes) && item.plannedMinutes > 0);
  if (!selected || !timed) return Math.max(1, Math.ceil(uniform));
  const total = plan.scenes.reduce((sum, item) => sum + item.plannedMinutes, 0);
  return Math.max(1, Math.ceil(contract.minBodyWords * selected.plannedMinutes / total));
}
function sceneBudget(contract, plan, scene) {
  const count = plan?.scenes?.length;
  if (!Number.isInteger(count) || count < 1) throw fail('GQEL_PLAN_INVALID', 'A scene budget requires a non-empty validated plan.');
  const targetWords = wordTarget(contract, plan, scene);
  return { targetWords,
    maxOutputTokens: Math.min(contract.maxOutputTokens, Math.max(1536, targetWords * 6 + 256)),
    maxCharacters: Math.max(4096, targetWords * 24) };
}

function sceneSchema(budget) {
  return { type: 'object', properties: { sceneText: { type: 'string', minLength: 20, maxLength: budget.maxCharacters } },
    required: ['sceneText'], additionalProperties: false };
}

module.exports = { sceneBudget, sceneSchema };
