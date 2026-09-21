'use strict';

/**
 * @file exaptationPatterns.js
 * @description Patterns d'exaptation biologique.
 *
 * Références :
 *  - Kassen (2019), Experimental evolution of innovation novelty (PMC6428436)
 *  - Colizzi et al. (2022), Modelling the evolution of novelty (PMC9750852)
 */

const EXAPTATION_PATTERNS = {
  full_reuse: {
    label: 'Réutilisation intégrale',
    question: (cap, newCtx) => `La capacité "${cap.id}" conçue pour ${cap.origin_context || 'son contexte d\'origine'} peut-elle résoudre ${newCtx} ?`,
    applicability: 'haute',
    risk: 'faible',
  },
  fragment_reuse: {
    label: 'Réutilisation de fragment',
    question: (cap, newCtx) => `Un sous-composant de "${cap.id}" peut-il être dérivé pour ${newCtx} ?`,
    applicability: 'moyenne',
    risk: 'moyen',
  },
  combination: {
    label: 'Combinaison innovante',
    question: (cap, context) => `La capacité "${cap.id}" combinée à "${context.second_capability || 'une autre capacité'}" peut-elle générer une nouvelle fonction ?`,
    applicability: 'variable',
    risk: 'élevé',
  },
  role_shift: {
    label: 'Changement de rôle',
    question: (cap) => `"${cap.id}" (auparavant ${cap.original_role || 'outil/stratégie'}) peut-elle changer de rôle fonctionnel ?`,
    applicability: 'haute',
    risk: 'faible',
  },
  scale_shift: {
    label: 'Changement d\'échelle',
    question: (cap) => `"${cap.id}" peut-elle opérer à une échelle différente (${cap.origin_scale || 'origine'} → ${cap.target_scale || 'nouvelle'}) ?`,
    applicability: 'moyenne',
    risk: 'moyen',
  },
  abstraction_extraction: {
    label: 'Extraction d\'abstraction',
    question: (cap) => `L'abstraction sous-jacente de "${cap.id}" peut-elle être extraite et réutilisée ailleurs ?`,
    applicability: 'haute',
    risk: 'faible',
  },
};

module.exports = { EXAPTATION_PATTERNS };
