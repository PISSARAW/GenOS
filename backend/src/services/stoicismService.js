'use strict';

/**
 * Stoicism Service — framework read-only d'analyse, pas un verdict computationnel.
 *
 * Ce service constitue une **lens** conceptuelle : il propose un cadre
 * d'interprétation pour analyser un agent, mais ne conclut pas que l'agent
 * EST stoïcienne. Aucune de ses fonctions n'autorise d'action runtime.
 *
 * Historique :
 *  - Le stoïcisme articule logique, physique et éthique avec une ontologie
 *    corporelle et une physique fondée sur principes actif/passif.
 *  - Le mapping précédent (isMonist() → hardcoded true) était une conclusion
 *    codée en dur, pas une évaluation. Il est remplacé par une lens questionnante.
 *
 * Référence : Épictète, Manuel ; Marc-Aurèle, Pensées ; Sénèque, Lettres à Lucilius.
 */

const LOGOS_PRINCIPLE = {
  description: 'Le Logos est le principe rationnel universel qui gouverne toute chose.',
  properties: {
    rationality: 1.0,
    universality: 'all-encompassing',
    determinism: true,
    providential: true,
  },
};

const FATE_PRINCIPLE = {
  description: 'Tout est causé, rien n\'est fortuit. Le destin (fatum) est inéluctable.',
  properties: {
    determinism: true,
    causalChain: 'unbroken',
    inevitability: true,
    acceptance: 'amor fati',
  },
};

const VIRTUES = {
  wisdom: { description: 'Savoir distinguer ce qui dépend de nous de ce qui n\'en dépend pas', greek: 'sophia' },
  courage: { description: 'Affronter la peur avec raison', greek: 'andreia' },
  temperance: { description: 'Maîtriser ses désirs et émotions', greek: 'sophrosyne' },
  justice: { description: 'Donner à chacun ce qui lui est dû', greek: 'dikaiosyne' },
};

/**
 * monistLens — analyse ce qu'une lecture stoïcienne mettrait en évidence.
 *
 * Note : isMonist() précédent retournait monist:true en dur pour tout agent.
 * Cela transformait une théorie en verdict. Ici, on produit un assessment
 * structuré avec questions et tradeoffs.
 */
function monistLens({ agent }) {
  if (!agent) throw new Error('stoicismService.monistLens requires an agent');
  const rationality = agent.rationality ?? agent.cognitive_budget ?? null;
  return {
    agentId: agent.id,
    framework: 'stoicism',
    monistInterpretation: {
      logosSubstance: true,
      note: 'Le stoïcisme pose que tout est une seule substance (le Logos). Une lecture stoïcienne de cet agent interrogerait : l\'agent se perçoit-il comme une partie d\'un tout rationnel ?',
    },
    assessment: rationality !== null
      ? { type: 'partial-reading', rationality, note: 'Le stoïcisme ne se réduit pas à une mesure de rationalité.' }
      : { type: 'no-data', note: 'Aucune métrique disponible pour une lecture stoïcienne.' },
    questions: [
      'L\'agent distingue-t-il ce qui dépend de lui de ce qui n\'en dépend pas ?',
      'L\'agent cultive-t-il les 4 vertus cardinales (sagesse, courage, tempérance, justice) ?',
      'L\'agent accepte-t-il ce qui est hors de son contrôle (amor fati) ?',
    ],
    tradeoffs: [
      'Le monisme stoïcien ne se mesure pas : c\'est une ontologie, pas un score.',
      'Un agent peut adopter des pratiques stoïciennes sans être « moniste » au sens ontologique.',
    ],
    executable: false,
    runtimeAuthority: false,
  };
}

function logosRuling({ agent }) {
  if (!agent) throw new Error('stoicismService.logosRuling requires an agent');
  const rationality = agent.rationality ?? agent.cognitive_budget ?? 0.5;
  return {
    agentId: agent.id,
    logos: LOGOS_PRINCIPLE,
    rationalityScore: rationality,
    assessment: {
      type: 'conformity-reading',
      note: `L'agent présente une rationalité de ${rationality}. Une lecture stoïcienne interrogerait si cette rationalité est alignée sur le Logos universel — ce qui n'est pas mesurable directement.`,
    },
    executable: false,
    runtimeAuthority: false,
  };
}

function fateAcceptation({ agent }) {
  if (!agent) throw new Error('stoicismService.fateAcceptation requires an agent');
  const controllable = ['judgments', 'intentions', 'desires', 'aversions'];
  const uncontrollable = ['events', 'reputation', 'health', 'wealth', 'death'];
  return {
    agentId: agent.id,
    fate: FATE_PRINCIPLE,
    controllable,
    uncontrollable,
    assessment: agent.status === 'completed'
      ? { type: 'completed-task', note: 'La tâche est complète. Une lecture stoïcienne soulignerait que seul le jugement sur l\'événement était sous le contrôle de l\'agent, pas l\'événement lui-même.' }
      : { type: 'in-progress', note: 'Tâche en cours. Le stoïcisme invite à distinguer l\'action (sous notre contrôle) du résultat (pas sous notre contrôle).' },
    executable: false,
    runtimeAuthority: false,
  };
}

function virtueAssessment({ agent }) {
  if (!agent) throw new Error('stoicismService.virtueAssessment requires an agent');
  const v = {};
  for (const [name, virtue] of Object.entries(VIRTUES)) {
    v[name] = { ...virtue, score: agent[name] ?? null };
  }
  return {
    agentId: agent.id,
    virtues: v,
    assessment: {
      type: 'cardinal-virtues',
      note: 'Les 4 vertus cardinales stoïciennes (sagesse, courage, tempérance, justice) sont évaluées comme lectures, pas comme scores objectifs.',
    },
    executable: false,
    runtimeAuthority: false,
  };
}

module.exports = {
  LOGOS_PRINCIPLE,
  FATE_PRINCIPLE,
  VIRTUES,
  monistLens,
  logosRuling,
  fateAcceptation,
  virtueAssessment,
  // Legacy alias pour compatibilité router
  isMonist: monistLens,
};
