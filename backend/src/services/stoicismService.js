'use strict';

/**
 * Stoicism Service — Monisme, Logos, Fate.
 *
 * Mapping GenOS :
 *  - Monisme = tout est une seule substance (le Logos)
 *  - Logos = principe rationnel universel qui gouverne le monde
 *  - Fate = déterminisme causal inéluctable (tout est causé, rien n'est fortuit)
 *  - Acceptation = s'accepter ce qui est, distinguer ce qui dépend de nous de ce qui n'en dépend pas
 *  - Vertu = sagesse, courage, tempérance, justice (les 4 vertus cardinales stoïciennes)
 *
 * Référence : Épictète, *Manuel*, Marc-Aurèle, *Pensées*, Sénèque, *Lettres à Lucilius*.
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
 * isMonistEpicurean — évalue si un agent a un comportement moniste
 * (tout est une seule substance, le Logos).
 */
function isMonist({ agent }) {
  if (!agent) throw new Error('stoicismService.isMonist requires an agent');
  return {
    agentId: agent.id,
    monist: true,
    substance: 'logos',
    description: 'L\'agent est une manifestation du Logos universel — une seule substance.',
  };
}

/**
 * logosRuling — retourne le principe du Logos qui gouverne,
 * avec le degré de conformité de l'agent à ce principe.
 */
function logosRuling({ agent }) {
  if (!agent) throw new Error('stoicismService.logosRuling requires an agent');
  const rationality = agent.rationality || agent.cognitive_budget || 0.5;
  return {
    agentId: agent.id,
    logos: LOGOS_PRINCIPLE,
    conformity: rationality,
    description: `L'agent suit le Logos avec une conformité de ${rationality}.`,
  };
}

/**
 * fateAcceptance — évalue l'acceptation du destin (amor fati).
 * Distingue ce qui dépend de nous (jugements, intentions) de ce qui n'en dépend pas (événements extérieurs).
 */
function fateAcceptation({ agent }) {
  if (!agent) throw new Error('stoicismService.fateAcceptation requires an agent');
  const controllable = ['judgments', 'intentions', 'desires', 'aversions'];
  const uncontrollable = ['events', 'reputation', 'health', 'wealth', 'death'];
  return {
    agentId: agent.id,
    fate: FATE_PRINCIPLE,
    controllable,
    uncontrollable,
    acceptance: agent.status === 'completed' ? 'fully_accepted' : 'in_progress',
    description: 'Distinguer ce qui dépend de nous (jugements) de ce qui n\'en dépend pas (événements).',
  };
}

/**
 * virtueAssessment — évalue les 4 vertus cardinales stoïciennes d'un agent.
 */
function virtueAssessment({ agent }) {
  if (!agent) throw new Error('stoicismService.virtueAssessment requires an agent');
  const v = {};
  for (const [name, virtue] of Object.entries(VIRTUES)) {
    v[name] = { ...virtue, score: agent[name] || 0 };
  }
  return { agentId: agent.id, virtues: v };
}

module.exports = {
  LOGOS_PRINCIPLE,
  FATE_PRINCIPLE,
  VIRTUES,
  isMonist,
  logosRuling,
  fateAcceptation,
  virtueAssessment,
};
