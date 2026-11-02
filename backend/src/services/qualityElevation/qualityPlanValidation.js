'use strict';
const { fail } = require('./qualityContract');
const { defect, isHeading } = require('./qualityText');
function requiredText(value) { return typeof value === 'string' && value.trim().length > 0; }
function validateScene(scene) {
  const required = ['id', 'heading', 'goal', 'obstacle', 'decision', 'consequence', 'stateAfter', 'timingRationale'];
  return Boolean(scene) && required.every(field => requiredText(scene[field])) && /^S[1-9]\d*$/.test(scene.id)
    && isHeading(scene.heading) && Number.isFinite(scene.plannedMinutes) && scene.plannedMinutes > 0;
}
function validateCharacters(characters) {
  if (!Array.isArray(characters) || !characters.length) throw fail('GQEL_PLAN_INVALID', 'Character state required.');
  const valid = characters.every(item => item && ['name', 'want', 'fear', 'knowledge'].every(field => requiredText(item[field])));
  if (!valid) throw fail('GQEL_PLAN_INVALID', 'Character motivations and knowledge must be explicit.');
}
function validateScenePlan(scenes, contract) {
  if (!Array.isArray(scenes) || !scenes.every(validateScene)) throw fail('GQEL_PLAN_INVALID', 'Incomplete scene obligations.');
  if (scenes.length < contract.minSceneCount || scenes.length > contract.maxSceneCount) throw fail('GQEL_PLAN_INVALID', 'Scene count outside explicit contract.');
  if (!scenes.every((scene, index) => scene.id === `S${index + 1}`)) throw fail('GQEL_PLAN_INVALID', 'Consecutive unique scene identifiers required.');
}
function validatePlanStructure(plan, contract) {
  if (!requiredText(plan.premise) || !Array.isArray(plan.rules) || !plan.rules.length || !plan.rules.every(requiredText)) {
    throw fail('GQEL_PLAN_INVALID', 'Premise and non-empty causal rules required.');
  }
  validateCharacters(plan.characters); validateScenePlan(plan.scenes, contract); return plan;
}
function pacingGuide(plan, contract) {
  const total = plan.scenes.reduce((sum, scene) => sum + scene.plannedMinutes, 0);
  if (!Number.isFinite(total)) throw fail('GQEL_PLAN_INVALID', 'Non-finite total duration.');
  const target = contract.targetMinutes;
  if (target === null) return { proposedMinutes: total, targetMinutes: null, allocations: [], durationVerified: false };
  let allocated = 0;
  const units = Math.round(target * 1000);
  const allocations = plan.scenes.map((scene, index) => {
    const amount = index === plan.scenes.length - 1 ? units - allocated : Math.floor(units * scene.plannedMinutes / total);
    allocated += amount;
    return { id: scene.id, proposedMinutes: scene.plannedMinutes, suggestedMinutes: amount / 1000 };
  });
  return { proposedMinutes: total, targetMinutes: target, allocations, durationVerified: false,
    authority: 'content_revision_guidance_only_not_retiming_proof' };
}
function durationDefects(plan, contract) {
  const guide = pacingGuide(plan, contract);
  if (guide.targetMinutes === null || Math.abs(guide.proposedMinutes - guide.targetMinutes) <= guide.targetMinutes * 0.2) return [];
  return [defect('PLAN_PACING_MISMATCH', `Le plan annonce ${guide.proposedMinutes} min pour ${guide.targetMinutes} min visées. `
    + 'Réduire ou développer réellement les événements ; changer seulement les nombres ne prouve aucune correction.', { stage: 'plan', section: 'duration_supported' })];
}
function validatePlan(plan, contract) {
  validatePlanStructure(plan, contract);
  const defects = durationDefects(plan, contract);
  if (defects.length) throw fail('GQEL_PLAN_INVALID', defects[0].message);
  return plan;
}
module.exports = { validatePlanStructure, validatePlan, durationDefects, pacingGuide };
