'use strict';
const { digest, fail } = require('./qualityContract');
const { parseObject, assessArtifact } = require('./qualityReviewService');
const { scenesOf, defect } = require('./qualityText');
function requiredText(value) { return typeof value === 'string' && value.trim().length > 0; }
function validateScene(scene) {
  const required = ['id', 'heading', 'goal', 'obstacle', 'decision', 'consequence', 'stateAfter', 'timingRationale'];
  return required.every(field => requiredText(scene[field])) && /^S[1-9]\d*$/.test(scene.id)
    && Number.isFinite(scene.plannedMinutes) && scene.plannedMinutes > 0;
}
function validateCharacters(characters) {
  if (!Array.isArray(characters) || !characters.length) throw fail('GQEL_PLAN_INVALID', 'Character state required.');
  const valid = characters.every(item => ['name', 'want', 'fear', 'knowledge'].every(field => requiredText(item[field])));
  if (!valid) throw fail('GQEL_PLAN_INVALID', 'Character motivations and knowledge must be explicit.');
}
function validateScenePlan(scenes, contract) {
  if (!Array.isArray(scenes) || !scenes.every(validateScene)) throw fail('GQEL_PLAN_INVALID', 'Incomplete scene obligations.');
  if (scenes.length < contract.minSceneCount || scenes.length > contract.maxSceneCount) throw fail('GQEL_PLAN_INVALID', 'Scene count outside explicit contract.');
  if (!scenes.every((scene, index) => scene.id === `S${index + 1}`)) throw fail('GQEL_PLAN_INVALID', 'Consecutive unique scene identifiers required.');
  const minutes = scenes.reduce((sum, scene) => sum + scene.plannedMinutes, 0);
  if (contract.targetMinutes !== null && Math.abs(minutes - contract.targetMinutes) > contract.targetMinutes * 0.2) throw fail('GQEL_PLAN_INVALID', 'Planned durations do not match the target.');
}
function validatePlan(plan, contract) {
  if (!requiredText(plan.premise) || !Array.isArray(plan.rules) || !plan.rules.every(requiredText)) throw fail('GQEL_PLAN_INVALID', 'Premise and causal rules required.');
  validateCharacters(plan.characters); validateScenePlan(plan.scenes, contract); return plan;
}
function planPrompt(context) {
  return 'Construis un plan causal de scénario, pas le scénario final. Établis les règles qui rendent le danger et les choix nécessaires. '
    + 'Explore les alternatives plausibles puis montre pourquoi elles échouent, sans supprimer les contraintes du brief. '
    + 'Chaque scène doit modifier la situation par une décision observable. Les durées sont des hypothèses de production, jamais une mesure. '
    + 'Réponds en JSON : {premise,rules:[texte],characters:[{name,want,fear,knowledge}],'
    + 'scenes:[{id:"S1",heading:"INT. ... - NUIT",goal,obstacle,decision,consequence,stateAfter,plannedMinutes,timingRationale}]}. '
    + `Prévois ${context.contract.minSceneCount} à ${context.contract.maxSceneCount} scènes.\n`
    + JSON.stringify({ mission: context.contract.mission, targetMinutes: context.contract.targetMinutes,
      repair: context.repairPlan, previousPlan: context.rejectedPlan || context.construction?.plan || null });
}
function planCriteria(contract) {
  return contract.criteria.filter(item => item.stage === 'plan' || item.id === 'brief_coverage').map(item =>
    item.id === 'brief_coverage' ? { ...item, description: 'Le plan prévoit les événements et contraintes du brief ; ne pas exiger ici un scénario déjà rédigé.' } : item);
}
async function preparePlan(context) {
  if (context.construction?.plan && context.repairPlan.stage !== 'plan') return context.construction.plan;
  const raw = await context.invoke(context.generator, { operation: 'narrative_plan', stage: 'plan', iteration: context.iteration, prompt: planPrompt(context) });
  let plan;
  try { plan = validatePlan(parseObject(raw), context.contract); }
  catch (error) { throw Object.assign(fail('GQEL_PLAN_INVALID', error.message), { repairable: true,
    defects: [defect('PLAN_INVALID', error.message, { stage: 'plan' })] }); }
  const content = JSON.stringify(plan, null, 2), criteria = planCriteria(context.contract);
  const scan = { artifactDigest: digest(content), defects: [], metrics: {}, structuralPassed: true };
  const assessment = await assessArtifact({ ...context, content, scan, criteria, phase: 'plan' });
  context.session.plans.push({ plan, assessment });
  if (!assessment.passed) throw Object.assign(fail('GQEL_PLAN_REJECTED', 'Plan rejected before drafting.'), { repairable: true, plan, defects: assessment.defects });
  return plan;
}
function scenePrompt(context, scene, previous) {
  return 'Écris intégralement UNE scène de scénario en français, sous forme d’actions observables et, si pertinent, de dialogues. '
    + 'Ne remplace pas la scène par son résumé, une note critique ou une émotion annoncée. '
    + 'Aucune prémisse, fiche, note de qualité ni conclusion explicative. Commence par l’en-tête indiqué et termine la scène. '
    + 'Respecte les connaissances et les conséquences établies dans les scènes déjà écrites. '
    + 'Le plan fournit des intentions : ne transforme pas ses événements futurs en souvenirs déjà vécus.\n'
    + JSON.stringify({ mission: context.contract.mission, plan: context.plan, scene, previousScenes: previous, repair: context.repairPlan,
      priorScene: context.construction?.scenes?.find(item => item.id === scene.id)?.text || null });
}
function canPreserve(context, scene) {
  return context.repairPlan.stage === 'scene' && context.repairPlan.invalidated.length > 0
    && !context.repairPlan.invalidated.includes(scene.id) && context.construction?.scenes?.some(item => item.id === scene.id);
}
async function constructScreenplay(context) {
  const plan = await preparePlan(context), scenes = [];
  for (const scene of plan.scenes) {
    if (canPreserve(context, scene)) { scenes.push(context.construction.scenes.find(item => item.id === scene.id)); continue; }
    const raw = await context.invoke(context.generator, { operation: `write:${scene.id}`, stage: 'scene', iteration: context.iteration,
      prompt: scenePrompt({ ...context, plan }, scene, scenes) });
    const text = typeof raw === 'string' ? raw.trim() : '';
    if (scenesOf(text).length !== 1) throw Object.assign(fail('GQEL_SCENE_INVALID', 'Exactly one developed scene expected.'),
      { repairable: true, defects: [defect('SCENE_INVALID', `Développer ${scene.id} dans une scène unique.`, { stage: 'scene', section: scene.id })] });
    scenes.push({ id: scene.id, text, digest: digest(text) });
    context.session.sceneDrafts.push({ iteration: context.iteration, ...scenes[scenes.length - 1] });
  }
  return { content: scenes.map(scene => scene.text).join('\n\n'), construction: { plan, scenes } };
}
module.exports = { constructScreenplay, validatePlan, scenePrompt, planPrompt };
