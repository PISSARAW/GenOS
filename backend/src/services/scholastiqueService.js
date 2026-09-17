'use strict';

/**
 * Scholastique Service — Équivocité, analogie, univocité.
 *
 * Mapping GenOS :
 *  - Équivocité = un même terme désigne des réalités différentes (ex: "être" pour substance et accident)
 *  - Analogie = un terme est proportionnellement similaire dans deux contextes (ex: "santé" pour corps et âme)
 *  - Univocité = un même terme désigne exactement la même chose dans toutes ses applications
 *
 * Référence : Thomas d'Aquin, *Summa Theologica*, *De Ente et Essentia* ;
 * Jean Duns Scot, *Ordinatio* ; Pierre Abélard, *Sic et Non*.
 */

const TERM_TYPES = {
  EQUIVOCAL: 'equivocal',
  ANALOGICAL: 'analogous',
  UNIVOCAL: 'univocal',
};

function equivocalTerms(term) {
  return { term, type: TERM_TYPES.EQUIVOCAL, senses: 'multiple_unrelated', description: `Le terme "${term}" désigne des réalités sans rapport entre elles.` };
}

function analogicalTerms(term, contexts) {
  if (!Array.isArray(contexts) || contexts.length < 2) {
    throw new Error('scholastiqueService.analogicalTerms requires at least 2 contexts');
  }
  return { term, type: TERM_TYPES.ANALOGICAL, contexts, proportion: 'partial', description: `Le terme "${term}" est proportionnellement similaire dans chaque contexte.` };
}

function univocalTerms(term, essence) {
  return { term, type: TERM_TYPES.UNIVOCAL, essence, description: `Le terme "${term}" désigne exactement la même essence dans toutes ses applications.` };
}

const SCHOLASTIC_METHOD = {
  description: 'La méthode scholastique : poser une question, collecting des arguments pro et con, puis résoudre par la dialectique (sic et non).',
  steps: ['quaestio', 'argumenta_pro', 'argumenta_contra', 'responsio', 'conclusio'],
};

module.exports = {
  TERM_TYPES,
  equivocalTerms,
  analogicalTerms,
  univocalTerms,
  SCHOLASTIC_METHOD,
};
