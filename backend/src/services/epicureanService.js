'use strict';

/**
 * Epicurean Service — framework read-only d'analyse, pas un verdict computationnel.
 *
 * Ce service constitue une **lens** conceptuelle : il propose un cadre
 * d'interprétation pour analyser un agent, mais ne conclut pas que l'agent
 * EST épicurien. Aucune de ses fonctions n'autorise d'action runtime.
 *
 * Historique :
 *  - Le mapping précédent (atomSchema créant 3 types d'atomes corps/âme/esprit)
 *    était inexact : chez Épicure, l'ÂME elle-même est composée d'atomes, ce
 *    ne sont pas 3 espèces fondamentales distinctes.
 *  - Le service est corrigé pour constituer une lens questionnante.
 *
 * Référence : Épicure, Lettre à Ménécée, De la nature des choses.
 */

const VIDE_DESCRIPTION = 'Le vide est l\'espace dans lequel se meuvent les atomes. Il est aussi réel que les atomes.';
const ATARAXIE_DESCRIPTION = 'L\'ataraxie est l\'absence de trouble de l\'esprit — le but de la vie épicurienne.';
const APONIA_DESCRIPTION = 'L\'aponia est l\'absence de douleur du corps — condition nécessaire à l\'ataraxie.';

const THERAPIES = [
  { fear: 'peur des dieux', therapy: 'Les dieux sont des êtres éthérés ignorants ; ils ne punissent pas.' },
  { fear: 'peur de la mort', therapy: 'La mort n\'est rien pour nous : quand nous sommes morts, nous ne sommes pas.' },
  { fear: 'peur de la douleur', therapy: 'La douleur est brève ou faible ; elle n\'est pas à craindre.' },
  { fear: 'peur du futur', therapy: 'Le futur n\'est pas notre affaire ; vivez le présent.' },
];

/**
 * atomLens — lecture épicurienne de la composition d'un agent.
 *
 * Correction : le précédent atomSchema créait 3 types d'atomes (corps/âme/esprit)
 * comme espèces distinctes. Chez Épicure, l'ÂME est composée d'atomes — ce n'est
 * pas une espèce séparée. Ici on produit une lecture interrogative.
 */
function atomLens({ agent }) {
  if (!agent) throw new Error('epicureanService.atomLens requires an agent');
  return {
    agentId: agent.id,
    framework: 'epicureanism',
    atoms: {
      note: 'Pour Épicure, tout — corps, âme, esprit — est composé d\'atomes. Ce ne sont pas 3 espèces distinctes mais une même nature atomique.',
      composedOfAtoms: ['corps', 'âme', 'esprit'],
    },
    vide: VIDE_DESCRIPTION,
    assessment: {
      type: 'composition-reading',
      note: 'Une lecture épicurienne interrogerait la nature de la composition de l\'agent sans présupposer 3 types d\'atomes.',
    },
    executable: false,
    runtimeAuthority: false,
  };
}

/**
 * sensationCriteria — évalue la connaissance par les critères sensationnels.
 * Pour Épicure, la sensation est le critère de vérité : ce qui est vrai est ce qui est senti.
 */
function sensationCriteria({ sensation }) {
  if (!sensation) throw new Error('epicureanService.sensationCriteria requires a sensation');
  const clarity = sensation.clarity || 'clear';
  const intensity = sensation.intensity || 'strong';
  const truthValue = clarity === 'clear' && intensity === 'strong' ? 'true' : 'doubtful';
  return {
    sensation,
    truthValue,
    criterion: 'sensation',
    assessment: {
      type: 'sensation-reading',
      note: `La sensation (${clarity}, ${intensity}) est le critère de vérité épicurien.`,
    },
    executable: false,
    runtimeAuthority: false,
  };
}

/**
 * ataraxieAnalysis — lecture épicurienne de la tranquillité d'un agent.
 */
function ataraxieAnalysis({ agent }) {
  if (!agent) throw new Error('epicureanService.ataraxieAnalysis requires an agent');
  const tranquility = agent.tranquility ?? agent.cognitive_budget ?? null;
  return {
    agentId: agent.id,
    ataraxie: tranquility !== null ? tranquility >= 0.8 : null,
    tranquility,
    assessment: tranquility !== null
      ? { type: 'tranquility-reading', note: `Tranquillité à ${tranquility}. L'ataraxie (≥0.8) est le but épicurien, mais c'est une lecture, pas un verdict.` }
      : { type: 'no-data', note: 'Aucune métrique disponible pour une lecture épicurienne de la tranquillité.' },
    executable: false,
    runtimeAuthority: false,
  };
}

function therapy() {
  return {
    ataraxie: ATARAXIE_DESCRIPTION,
    aponia: APONIA_DESCRIPTION,
    therapies: THERAPIES,
    assessment: { type: 'spirit-therapy', note: 'La philosophie est une thérapie de l\'esprit : elle libère des peurs.' },
    executable: false,
    runtimeAuthority: false,
  };
}

module.exports = {
  VIDE_DESCRIPTION,
  ATARAXIE_DESCRIPTION,
  APONIA_DESCRIPTION,
  THERAPIES,
  atomLens,
  sensationCriteria,
  ataraxieAnalysis,
  therapy,
  // Legacy alias pour compatibilité router
  atomSchema: atomLens,
  ataxia: ataraxieAnalysis,
};
