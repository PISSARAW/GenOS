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
  const maxOutputTokens = Math.min(contract.maxOutputTokens, Math.max(1536, targetWords * 6 + 256));
  const maxCharacters = Math.max(4096, targetWords * 24);
  const maxLines = Math.max(12, Math.min(64, Math.ceil(targetWords / 10) + 10));
  const bodyCharacters = Math.min(maxCharacters, Math.max(960, targetWords * 12), maxOutputTokens * 2);
  return { targetWords, maxOutputTokens, maxCharacters, maxLines,
    maxLineCharacters: Math.max(1, Math.min(2000, Math.floor(bodyCharacters / maxLines))) };
}

function sceneSchema(budget) {
  return { type: 'object', properties: { lines: { type: 'array', minItems: 1, maxItems: budget.maxLines,
    items: { type: 'string', minLength: 1, maxLength: budget.maxLineCharacters } } },
    required: ['lines'], additionalProperties: false };
}

module.exports = { sceneBudget, sceneSchema };
