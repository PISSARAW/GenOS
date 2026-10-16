'use strict';

// Garde de qualification du protocole de changement de regime.
// Le plan actuel est pilote (pilot-grade, non confirmatoire) : une seule
// repetition par couple tache-condition, familles partagees entre
// entrainement et test, contrainte de phase 2 deja contenue dans le prompt.
// Les champs requiredRepetitions / familyDisjointness / revealMechanism du
// plan declarent la barre confirmatoire ; le garde compare les valeurs
// reelles (seeds, familles, revealSpec) a cette barre et refuse le label
// confirmatory tant qu'elle n'est pas atteinte. Aucun resultat invente.

const FALLBACK_REPETITIONS = 3;
const EXTERNAL_REVEAL = 'external-temporal-injection';

function repetitionsOf(plan) {
  if (Number.isInteger(plan.repetitions) && plan.repetitions > 0) return plan.repetitions;
  if (Array.isArray(plan.seeds)) return plan.seeds.length;
  return 1;
}

function requiredRepetitionsOf(plan) {
  if (Number.isInteger(plan.requiredRepetitions) && plan.requiredRepetitions > 0) {
    return plan.requiredRepetitions;
  }
  return FALLBACK_REPETITIONS;
}

function familyOfTrainId(taskId) {
  const parts = String(taskId).split('-');
  return `regime-${parts[1]}`;
}

function splitFamilies(plan, tasks) {
  const training = new Set();
  const trainIds = (plan.training && plan.training.taskIds) || [];
  for (const id of trainIds) training.add(familyOfTrainId(id));
  const holdout = new Set();
  for (const task of tasks || []) {
    if (task.split === 'holdout' && task.family) holdout.add(task.family);
  }
  return { training: [...training].sort(), holdout: [...holdout].sort() };
}

function revealIsExternal(plan) {
  if (plan.revealMechanism !== EXTERNAL_REVEAL) return false;
  if (plan.revealActual && plan.revealActual !== EXTERNAL_REVEAL) return false;
  const spec = String(plan.revealSpec || '');
  if (/dans le prompt|contenue dans|within (one|the) prompt|informational within/i.test(spec)) return false;
  return true;
}

function qualifyRegimePlan(plan, tasks) {
  const reasons = [];
  const repetitions = repetitionsOf(plan);
  const required = requiredRepetitionsOf(plan);
  if (repetitions < required) {
    reasons.push(`repetitions insuffisantes : ${repetitions} < ${required} par couple tache-condition`);
  }
  const splits = splitFamilies(plan, tasks);
  const overlap = splits.training.filter((family) => splits.holdout.includes(family));
  if (overlap.length > 0) {
    reasons.push(`familles non disjointes train/test : ${overlap.join(', ')}`);
  }
  if (!revealIsExternal(plan)) {
    reasons.push('revelation non externe : contrainte de phase 2 deja dans le prompt, pas d\'injection temporelle externe');
  }
  return {
    grade: reasons.length === 0 ? 'confirmatory' : 'pilot',
    reasons,
    repetitions,
    requiredRepetitions: required,
    trainingFamilies: splits.training,
    holdoutFamilies: splits.holdout
  };
}

function assertConfirmatory(plan, tasks) {
  const qualification = qualifyRegimePlan(plan, tasks);
  if (qualification.grade !== 'confirmatory') {
    throw new Error(`Protocole non confirmatoire (pilot-grade) : ${qualification.reasons.join(' ; ')}`);
  }
  return qualification;
}

module.exports = { qualifyRegimePlan, assertConfirmatory, repetitionsOf, splitFamilies, revealIsExternal };
