'use strict';
const { digest, freeze, fail } = require('./qualityContract');
const { parseObject, assessArtifact } = require('./qualityReviewService');
const { validatedCall } = require('./qualityProtocol');
const { planSchema } = require('./qualitySchemas');
const { validatePlanStructure, durationDefects, pacingGuide } = require('./qualityPlanValidation');
function planPrompt(context) {
  return 'Construis un plan causal, pas le scénario final. Les règles doivent relier danger, alternatives, choix et conséquences. '
    + 'Chaque règle dans rules doit être une phrase complète formulant une contrainte dramatique (ex: "La fuite de pathogène se propage si le sas reste ouvert."). '
    + 'Partager un objectif est autorisé : distingue les personnages par leurs informations, moyens, valeurs ou risques acceptés, '
    + 'sans inventer une opposition contraire au brief. Un résumé structuré est adapté à cette étape. '
    + 'Chaque scène prévoit un changement de situation. Les durées sont des estimations, jamais une preuve. '
    + 'Chaque heading de scène doit obligatoirement être un en-tête débutant par INT. ou EXT. (ex: "INT. MODULE PRINCIPAL - NUIT", "EXT. STATION ORBITALE - ESPACE"). '
    + 'Chaque champ textuel de scène (goal, obstacle, decision, consequence, stateAfter, timingRationale) doit se terminer par un point. '
    + 'En réparation, conserve les éléments non concernés et corrige les relations signalées et leurs conséquences. '
    + 'Le pacingGuide est un budget de rythme : adapte réellement les actions plutôt que seulement leurs chiffres. '
    + 'Réponds uniquement un JSON selon le schéma fourni : premise, rules, characters, scenes avec identifiants S1, S2, etc.\n'
    + JSON.stringify({ mission: context.contract.mission, targetMinutes: context.contract.targetMinutes,
      minSceneCount: context.contract.minSceneCount, maxSceneCount: context.contract.maxSceneCount,
      repair: context.repairPlan, previousPlan: context.previousPlan || null, pacingGuide: context.pacingGuide || null });
}
function planCriteria(contract) {
  return contract.criteria.filter(item => item.stage === 'plan' || item.id === 'brief_coverage').map(item =>
    item.id === 'brief_coverage' ? { ...item, description: 'Le plan prévoit les événements et contraintes du brief ; ne pas exiger ici des scènes déjà rédigées.' } : item);
}
function previousPlan(context) { return context.rejectedPlan || context.construction?.plan || null; }
async function generatePlan(context) {
  const schema = planSchema(context.contract);
  return validatedCall({ ...context, callback: context.generator }, { operation: 'narrative_plan', stage: 'plan',
    iteration: context.iteration, responseSchema: schema, prompt: planPrompt(context) }, raw => validatePlanStructure(parseObject(raw), context.contract));
}
async function inspectPlan(context, plan, attempt) {
  const content = JSON.stringify(plan, null, 2), criteria = planCriteria(context.contract);
  const scan = { artifactDigest: digest(content), defects: durationDefects(plan, context.contract),
    metrics: { pacing: pacingGuide(plan, context.contract) }, structuralPassed: true };
  const record = { iteration: context.iteration, attempt, plan: freeze(structuredClone(plan)),
    digest: digest(content), assessment: null, stage: 'plan', acceptedForDelivery: false };
  context.session.plans.push(record);
  const assessment = await assessArtifact({ ...context, content, scan, criteria, phase: 'plan' });
  record.assessment = assessment;
  return { plan: record.plan, assessment, unresolved: assessment.defects, provisional: !assessment.passed };
}
function repairContext(context, state) {
  return { ...context, previousPlan: state.plan, pacingGuide: pacingGuide(state.plan, context.contract),
    repairPlan: { ...context.repairPlan, stage: 'plan', strategy: 'local_plan_repair', obligations: state.unresolved } };
}
function permitDraft(context, state) {
  if (!state.provisional) return state;
  if (context.contract.profile !== 'screenplay' || context.contract.allowProvisionalDraft !== true) {
    throw Object.assign(fail('GQEL_PLAN_REJECTED', 'Plan rejected under the strict drafting policy.'),
      { repairable: true, plan: state.plan, defects: state.unresolved });
  }
  // This permission concerns inert text creation only; it never authorizes delivery or external effects.
  context.session.events.push({ type: 'PROVISIONAL_DRAFT_AUTHORIZED', iteration: context.iteration,
    planDigest: digest(JSON.stringify(state.plan, null, 2)), unresolved: state.unresolved,
    scope: 'text_drafting_only', acceptedForDelivery: false });
  return state;
}
async function preparePlan(context) {
  if (context.construction?.plan && context.repairPlan.stage !== 'plan') return context.construction.planState;
  let request = { ...context, previousPlan: previousPlan(context) }, state;
  for (let attempt = 0; attempt <= (context.contract.maxPlanRepairs ?? 0); attempt++) {
    const plan = await generatePlan(request);
    state = await inspectPlan(context, plan, attempt);
    if (!state.provisional) return state;
    if (attempt < (context.contract.maxPlanRepairs ?? 0)) {
      context.session.planRepairs.push({ iteration: context.iteration, attempt: attempt + 1, defects: state.unresolved,
        previousDigest: digest(JSON.stringify(plan, null, 2)), timing: pacingGuide(plan, context.contract) });
      request = repairContext(context, state);
    }
  }
  return permitDraft(context, state);
}
module.exports = { preparePlan, planPrompt, planCriteria };
