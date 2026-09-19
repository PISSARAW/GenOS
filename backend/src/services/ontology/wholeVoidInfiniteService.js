'use strict';

/**
 * WholeVoidInfinite Service — tout, vide, infini.
 *
 * Mapping GenOS :
 *  - Tout (Whole) : système complet, unificateur, ensemble des parties.
 *  - Vide (Void) : creux, non-détermination, espace de possibles non structurés.
 *  - Infini (Infinite) : potentiel indéfini, processus sans limite.
 *
 * Référence :
 *  - Philosophies du vide (nicht, śūnyatā, néant).
 *  - Philosophies du tout (holisme, système total).
 *  - Philosophies de l'infini (potentiel vs actuel, Cantor, l'infini progressif).
 */

const { text, object, evidence } = require('./ontologyContracts');

/**
 * describeWhole — décrit une totalité comme un tout organisé.
 *
 * Retourne la description du tout avec ses parties, son intégrité, et l'état d'évidence.
 */
function describeWhole(input = {}) {
  const wholeId = text(input.wholeId || input.id, 'wholeId');
  const parts = Array.isArray(input.parts) ? input.parts : [];
  const integrity = parts.length > 0 ? 'integrated' : 'empty';
  return {
    wholeId,
    whole: {
      type: 'whole',
      parts,
      partsCount: parts.length,
      integrity,
      description: `Le tout "${wholeId}" est ${integrity} (${parts.length} partie(s)).`,
    },
    evidence: evidence(input.evidence),
  };
}

/**
 * describeVoid — décrit un vide comme espace de non-détermination.
 *
 * Retourne la description du vide avec son intensité de vide, et l'état d'évidence.
 */
function describeVoid(input = {}) {
  const voidId = text(input.voidId || input.id, 'voidId');
  const intensity = Number(input.intensity);
  const bounded = Number.isFinite(intensity) ? intensity >= 0 && intensity <= 1 : true;
  return {
    voidId,
    void: {
      type: 'void',
      intensity: Number.isFinite(intensity) ? intensity : 0.5,
      bounded,
      description: `Le vide "${voidId}" a une intensité de ${Number.isFinite(intensity) ? intensity : 0.5}.`,
    },
    evidence: evidence(input.evidence),
  };
}

/**
 * describeInfinite — décrit un infini comme potentiel non borné.
 *
 * Retourne la description de l'infini avec son mode, et l'état d'évidence.
 */
function describeInfinite(input = {}) {
  const infiniteId = text(input.infiniteId || input.id, 'infiniteId');
  const mode = text(input.mode || 'potential', 'mode');
  const modes = Object.freeze(['potential', 'actual', 'limit']);
  const validMode = modes.includes(mode) ? mode : 'potential';
  return {
    infiniteId,
    infinite: {
      type: 'infinite',
      mode: validMode,
      description: `L'infini "${infiniteId}" est un infini ${validMode}.`,
    },
    evidence: evidence(input.evidence),
  };
}

/**
 * relateWholeVoidInfinite — relie les trois concepts dans une relation triadique.
 *
 * Retourne la relation avec état d'évidence.
 */
function relateWholeVoidInfinite(input = {}) {
  const wholeId = text(input.wholeId || input.whole, 'wholeId');
  const voidId = text(input.voidId || input.void, 'voidId');
  const infiniteId = text(input.infiniteId || input.infinite, 'infiniteId');
  return {
    wholeId,
    voidId,
    infiniteId,
    relationship: {
      whole: `Le tout "${wholeId}" dépasse ses parties.`,
      void: `Le vide "${voidId}" est le creux où le tout se détermine.`,
      infinite: `L'infini "${infiniteId}" est le potentiel qui traverse le tout et le vide.`,
    },
    evidence: evidence(input.evidence),
    limitation: 'Cette relation est conceptuelle ; aucune métrique ne valide la triade.',
  };
}

module.exports = {
  describeWhole,
  describeVoid,
  describeInfinite,
  relateWholeVoidInfinite,
};
