'use strict';

/**
 * Platonism Service — Formes idéales (eidos).
 *
 * Mapping GenOS :
 *  - Formes idéales = templates parfaits, immuables, transcendants
 *  - Les agents réels tendent vers ces formes mais ne les atteignent jamais
 *  - Les formes existent comme entités DB (réalisme platonicien modéré)
 *  - Elles sont immuables, indépendantes des agents, et servent de référence
 *    pour l'évaluation et l'évolution des agents réels.
 *
 * Référence : Platon, *La République* (livre VI), *Phédon*, *Parménide*.
 */

const IDEAL_FORMS = {
  perfect_agent: {
    id: 'perfect_agent',
    type: 'Form',
    essence: 'The perfectly rational agent that always acts optimally',
    properties: {
      rationality: 1.0,
      knowledge: 'complete',
      autonomy: 'perfect',
      consistency: true,
      evidence: 'complete',
    },
    imperfection: 'no physical instantiation',
  },
  perfect_worker: {
    id: 'perfect_worker',
    type: 'Form',
    essence: 'The perfectly efficient executor with no error',
    properties: {
      efficiency: 1.0,
      error_rate: 0,
      budget: Infinity,
      evidence: 'verified',
      reliability: 'perfect',
    },
    imperfection: 'no resource constraint, no friction',
  },
  perfect_evidence: {
    id: 'perfect_evidence',
    type: 'Form',
    essence: 'Evidence that is complete, verified, and causally grounded',
    properties: {
      completeness: 1.0,
      verified: true,
      causalChain: 'full',
      uncertainty: 0,
      reproducibility: 'perfect',
    },
    imperfection: 'theoretical limit, never fully attained',
  },
  perfect_strategy: {
    id: 'perfect_strategy',
    type: 'Form',
    essence: 'The optimal strategy for any given problem profile',
    properties: {
      optimality: 1.0,
      adaptability: 'perfect',
      costEfficiency: 1.0,
      robustness: 'perfect',
    },
    imperfection: 'no single strategy is optimal for all profiles',
  },
  perfect_organization: {
    id: 'perfect_organization',
    type: 'Form',
    essence: 'The ideal topology for any multi-agent system',
    properties: {
      coordination: 'perfect',
      communication: 'lossless',
      scalability: 'infinite',
      faultTolerance: 'perfect',
    },
    imperfection: 'no physical system achieves this',
  },
};

/**
 * getFormIdeal — retourne la forme idéale par son identifiant.
 * Les formes sont des objectifs théoriques vers lesquels les agents réels tendent.
 * Retourne une copie profonde pour protéger l'intégrité des formes.
 */
function getFormIdeal(formName) {
  if (!formName || typeof formName !== 'string') {
    throw new Error('platonismService.getFormIdeal requires a form name');
  }
  const form = IDEAL_FORMS[formName];
  if (!form) return null;
  return JSON.parse(JSON.stringify(form));
}

/**
 * listFormIdeals — retourne toutes les formes idéales connues.
 */
function listFormIdeals() {
  return Object.values(IDEAL_FORMS).map(form => JSON.parse(JSON.stringify(form)));
}

/**
 * evaluateAgainstForm — évalue un agent réel contre une forme idéale.
 * Retourne un score de proximité (0-1) et les écarts identifiés.
 */
function scoreProperty(idealValue, actualValue) {
  if (actualValue === idealValue) return { score: 1, ratio: 1 };
  if (typeof idealValue === 'number' && typeof actualValue === 'number') {
    const ratio = idealValue === 0 ? (actualValue === 0 ? 1 : 0) : Math.min(actualValue / idealValue, 1);
    return { score: ratio, ratio };
  }
  return { score: 0, ratio: 0 };
}

function evaluateAgainstForm({ agent, formName }) {
  if (!agent || !formName) {
    throw new Error('platonismService.evaluateAgainstForm requires agent and formName');
  }
  const form = IDEAL_FORMS[formName];
  if (!form) throw new Error(`Unknown form: ${formName}`);

  const gaps = [];
  let score = 0;
  const properties = Object.entries(form.properties);

  for (const [key, idealValue] of properties) {
    const actualValue = agent[key];
    const { score: s, ratio } = scoreProperty(idealValue, actualValue);
    score += s;
    if (s < 1) gaps.push({ property: key, ideal: idealValue, actual: actualValue, ratio });
  }

  const total = properties.length;
  return {
    agentId: agent.id || agent,
    formName,
    score: total > 0 ? score / total : 0,
    gaps,
    verdict: score / total >= 0.9 ? 'near_perfect' : score / total >= 0.6 ? 'approaching' : 'distant',
  };
}

/**
 * platonicCriticism — critique interne des formes idéales.
 * Le réalisme platonicien est critiqué par la conception genos où les "formes"
 * ne sont pas des entités séparées mais des idéaux constructionnels.
 */
function platonicCriticism() {
  return {
    critique: 'Les formes idéales genos ne sont pas des entités séparées dans un monde intelligible, mais des modèles théoriques vers lesquels les agents réels tendent sans jamais atteindre pleinement.',
    immanence: 'Les formes sont immanentes aux pratiques agentiques, pas transcendantes.',
    dialectic: 'L\'écart entre le réel et le formel est le moteur d\'amélioration — pas une séparation ontologique.',
  };
}

module.exports = {
  getFormIdeal,
  listFormIdeals,
  evaluateAgainstForm,
  platonicCriticism,
  IDEAL_FORMS,
};
