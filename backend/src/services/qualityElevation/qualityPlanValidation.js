'use strict';
const { digest, fail } = require('./qualityContract');
const { defect, isHeading } = require('./qualityText');
const CAUSAL_FIELDS = ['decision', 'consequence', 'stateAfter'];
function requiredText(value) { return typeof value === 'string' && value.trim().length > 0; }
function validateScene(scene) {
  const required = ['id', 'heading', 'goal', 'obstacle', 'decision', 'consequence', 'stateAfter', 'timingRationale'];
  if (!scene || typeof scene !== 'object') throw fail('GQEL_PLAN_INVALID', 'Scene object missing.');
  for (const field of required) {
    if (!requiredText(scene[field])) throw fail('GQEL_PLAN_INVALID', `Field ${field} missing or empty in scene ${scene.id || 'unknown'}.`);
  }
  if (!/^S[1-9]\d*$/.test(scene.id)) throw fail('GQEL_PLAN_INVALID', `Scene identifier must be S1, S2, etc. (received: ${scene.id}).`);
  if (!isHeading(scene.heading)) throw fail('GQEL_PLAN_INVALID', `Scene heading must start with INT. or EXT. (received: "${scene.heading}").`);
  if (!Number.isFinite(scene.plannedMinutes) || scene.plannedMinutes <= 0) {
    throw fail('GQEL_PLAN_INVALID', `plannedMinutes must be a positive number in scene ${scene.id}.`);
  }
}
function validateCharacters(characters) {
  if (!Array.isArray(characters) || !characters.length) throw fail('GQEL_PLAN_INVALID', 'Character state required.');
  const valid = characters.every(item => item && ['name', 'want', 'fear', 'knowledge'].every(field => requiredText(item[field])));
  if (!valid) throw fail('GQEL_PLAN_INVALID', 'Character motivations and knowledge must be explicit.');
}
function validateScenePlan(scenes, contract) {
  if (!Array.isArray(scenes)) throw fail('GQEL_PLAN_INVALID', 'Scenes must be an array.');
  for (const scene of scenes) validateScene(scene);
  if (scenes.length < contract.minSceneCount || scenes.length > contract.maxSceneCount) throw fail('GQEL_PLAN_INVALID', 'Scene count outside explicit contract.');
  if (!scenes.every((scene, index) => scene.id === `S${index + 1}`)) throw fail('GQEL_PLAN_INVALID', 'Consecutive unique scene identifiers required.');
}
function validatePlanStructure(plan, contract) {
  if (!requiredText(plan.premise) || !Array.isArray(plan.rules) || !plan.rules.length || !plan.rules.every(requiredText)) {
    throw fail('GQEL_PLAN_INVALID', 'Premise and non-empty causal rules required.');
  }
  validateCharacters(plan.characters); validateScenePlan(plan.scenes, contract);
  assertCausalProgression(plan);
  return plan;
}
function causalTuple(scene) {
  return CAUSAL_FIELDS.map(field => scene[field].normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim());
}
function causalGroups(scenes) {
  const groups = new Map();
  for (const scene of scenes) {
    const key = JSON.stringify(causalTuple(scene));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(scene);
  }
  return [...groups.values()];
}
function causalEvidence(scene) {
  return CAUSAL_FIELDS.map(field => ({ sceneId: scene.id, field,
    quote: [...scene[field]].slice(0, 240).join(''), fieldDigest: digest(scene[field]) }));
}
function assertCausalProgression(plan) {
  const group = causalGroups(plan.scenes).find(items => items.length >= 3 && items.length > plan.scenes.length / 2);
  if (!group) return;
  const sceneIds = group.map(scene => scene.id);
  const message = `Les scènes ${sceneIds.join(', ')} copient les mêmes décision, conséquence et état final `
    + `(${group.length}/${plan.scenes.length}). Répare le plan par des transitions causales distinctes, sans modifier le brief.`;
  const diagnostic = { code: 'PLAN_CAUSAL_REPETITION', severity: 'major', stage: 'plan', section: 'causal_progression', message,
    metrics: { copies: group.length, totalScenes: plan.scenes.length, fraction: group.length / plan.scenes.length },
    provenance: { canonicalPlanDigest: digest(plan), tupleDigest: digest(causalTuple(group[0])), sceneIds },
    evidence: causalEvidence(group[0]) };
  throw Object.assign(fail('GQEL_PLAN_INVALID', message), { defects: [diagnostic] });
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
