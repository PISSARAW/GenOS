'use strict';

/**
 * Epicurean Service — Atomes, vide, sensations, ataraxie.
 *
 * Mapping GenOS :
 *  - Atomes = particules atomiques indévisibles qui composent toute chose
 *  - Vide = l'espace vide dans lequel se meuvent les atomes
 *  - Sensations = critères de vérité (ce qui est grave est ce qui est senti)
 *  - Ataraxie = absence de trouble de l'esprit (but de la vie épicurienne)
 *  - Aponia = absence de douleur du corps
 *  - Philosophie = thérapie de l'esprit (les doctrines libèrent des peurs)
 *
 * Référence : Épicure, *Lettre à Ménécée*, *De la nature des choses*.
 */

const ATOM_TYPES = ['corps', 'âme', 'esprit', 'divin'];

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
 * atomSchema — retourne le schéma atomique d'un agent.
 * Tout est composé d'atomes (corps, âme, esprit) dans un espace vide.
 */
function atomSchema({ agent }) {
  if (!agent) throw new Error('epicureanService.atomSchema requires an agent');
  return {
    agentId: agent.id,
    atoms: {
      corps: { type: 'corps', indivisible: true, properties: { solidity: 'absolute' } },
      âme: { type: 'âme', indivisible: true, properties: { animality: 'fully_alive' } },
      esprit: { type: 'esprit', indivisible: true, properties: { judgment: 'perfect' } },
    },
    vide: VIDE_DESCRIPTION,
    description: `L'agent ${agent.id} est composé d'atomes (corps, âme, esprit) dans un espace vide.`,
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
    description: `La sensation (${clarity}, ${intensity}) est le critère de vérité.`,
  };
}

/**
 * ataxia — évalue l'ataraxie d'un agent (absence de trouble de l'esprit).
 * L'ataraxie est le but de la vie épicurienne.
 */
function ataxia({ agent }) {
  if (!agent) throw new Error('epicureanService.ataxia requires an agent');
  const tranquility = agent.tranquility || agent.cognitive_budget || 0.5;
  const trouble = 1 - tranquility;
  return {
    agentId: agent.id,
    ataraxie: tranquility >= 0.8,
    tranquility,
    trouble,
    aponia: agent.aponia !== false,
    description: tranquility >= 0.8
      ? 'L\'agent a atteint l\'ataraxie — absence de trouble de l\'esprit.'
      : 'L\'agent n\'a pas encore atteint l\'ataraxie.',
  };
}

/**
 * therapy — retourne les thérapies épicuriennes pour les peurs.
 * La philosophie est une thérapie de l'esprit.
 */
function therapy() {
  return {
    ataraxie: ATARAXIE_DESCRIPTION,
    aponia: APONIA_DESCRIPTION,
    therapies: THERAPIES,
    description: 'La philosophie est une thérapie de l\'esprit : elle libère des peurs.',
  };
}

module.exports = {
  ATOM_TYPES,
  VIDE_DESCRIPTION,
  ATARAXIE_DESCRIPTION,
  APONIA_DESCRIPTION,
  THERAPIES,
  atomSchema,
  sensationCriteria,
  ataxia,
  therapy,
};
