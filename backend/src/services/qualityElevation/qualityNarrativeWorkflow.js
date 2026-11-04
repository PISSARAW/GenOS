'use strict';
const { digest, fail } = require('./qualityContract');
const { scenesOf, cleanLine } = require('./qualityText');
const { validatedCall } = require('./qualityProtocol');
const { preparePlan, planPrompt } = require('./qualityPlanWorkflow');
const { validatePlan, pacingGuide } = require('./qualityPlanValidation');
function dialogueInstruction(contract) {
  if (!contract.requireDialogue) return 'Les dialogues sont facultatifs selon les besoins de la scène. ';
  return 'Le livrable doit comporter des répliques au format scénario : écris le NOM DU PERSONNAGE '
    + 'en MAJUSCULES sur une ligne dédiée, puis sa réplique sur la ligne suivante. '
    + 'Exemple de format, sans imposer ce contenu : ' + JSON.stringify('PERSONNAGE\nUne réplique.') + '. ';
}
function scenePrompt(context, scene, previous) {
  const guide = pacingGuide(context.plan, context.contract);
  const allocation = guide.allocations.find(item => item.id === scene.id) || null;
  const targetWords = Math.ceil(context.contract.minBodyWords / context.plan.scenes.length);
  return 'Écris intégralement UNE scène de scénario en français, sous forme d’actions observables. '
    + dialogueInstruction(context.contract)
    + 'Ne remplace pas la scène par son résumé, une note critique ou une émotion annoncée. '
    + `Commence directement par l’en-tête ${scene.heading}, sans autre en-tête de scène ni titre introductif. `
    + 'Respecte les connaissances et conséquences des scènes précédentes. Les événements futurs du plan ne sont pas déjà vécus. '
    + 'Un plan provisoire contient des problèmes à résoudre : teste une solution concrète dans cette scène ; ce brouillon ne vaut pas validation. '
    + 'Le budget de rythme appelle des actions, obstacles, silences et décisions écrits, pas une durée affirmée. '
    + 'Le volume demandé concerne du contenu dramatique utile ; pas de remplissage ni de répétitions pour atteindre un compteur.\n'
    + JSON.stringify({ mission: context.contract.mission, plan: context.plan, scene, previousScenes: previous, repair: context.repairPlan,
      provisionalPlan: context.planState.provisional, unresolvedPlanObligations: context.planState.unresolved,
      pacingAllocation: allocation, indicativeWordsForThisScene: targetWords,
      priorScene: context.construction?.scenes?.find(item => item.id === scene.id)?.text || null });
}
function canPreserve(context, scene) {
  return context.repairPlan.stage === 'scene' && context.repairPlan.invalidated.length > 0
    && !context.repairPlan.invalidated.includes(scene.id) && context.construction?.scenes?.some(item => item.id === scene.id);
}
function sceneText(raw, scene) {
  const content = unpackScene(raw);
  const text = typeof content === 'string' ? content.trim() : '', parsed = scenesOf(text);
  if (parsed.length !== 1 || !parsed[0].text) throw fail('GQEL_SCENE_INVALID', `Exactly one non-empty scene expected for ${scene.id}.`);
  if (cleanLine(parsed[0].heading).toUpperCase() !== cleanLine(scene.heading).toUpperCase()) {
    throw fail('GQEL_SCENE_INVALID', `Expected heading ${scene.heading}.`);
  }
  return text;
}
function unpackScene(raw) {
  if (typeof raw !== 'string' || !raw.trim().startsWith('{')) return raw;
  return require('./qualityReviewService').parseObject(raw).sceneText;
}
async function writeScene(context, scene, scenes) {
  return validatedCall({ ...context, callback: context.generator }, { operation: `write:${scene.id}`, stage: 'scene',
    iteration: context.iteration, prompt: scenePrompt(context, scene, scenes),
    responseSchema: { type: 'object', properties: { sceneText: { type: 'string', minLength: 20 } },
      required: ['sceneText'], additionalProperties: false } }, raw => sceneText(raw, scene));
}
async function constructScreenplay(context) {
  const planState = await preparePlan(context), plan = planState.plan, scenes = [];
  for (const scene of plan.scenes) {
    if (canPreserve(context, scene)) { scenes.push(context.construction.scenes.find(item => item.id === scene.id)); continue; }
    const text = await writeScene({ ...context, plan, planState }, scene, scenes);
    scenes.push({ id: scene.id, text, digest: digest(text) });
    const draft = { iteration: context.iteration, provisionalPlan: planState.provisional, ...scenes[scenes.length - 1] };
    context.session.sceneDrafts.push(draft);
    context.session.events.push({ type: 'SCENE_DRAFTED', iteration: context.iteration, sceneId: scene.id, digest: draft.digest, acceptedForDelivery: false });
    // Preserve useful partial work even when a later model call or critic fails.
    if (context.input.onCheckpoint) await context.input.onCheckpoint(structuredClone(context.session));
  }
  return { content: scenes.map(scene => scene.text).join('\n\n'), construction: { plan, planState, scenes } };
}
module.exports = { constructScreenplay, validatePlan, scenePrompt, planPrompt };
