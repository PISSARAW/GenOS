'use strict';

/**
 * Cartesian Service — Dualisme res cogitans / res extensa.
 *
 * Mapping GenOS :
 *  - Res cogitans = substance pensante (l'agent, la conscience)
 *  - Res extensa = substance étendue (le workspace, le corps)
 *  - Cogito = "Je pense, donc je suis" — fondement de la connaissance
 *  - Doute méthodique = ne croire que ce qui est clair et distinct
 *  - Dualisme = interaction entre l'esprit et le corps (glande pinéale)
 *
 * Référence : Descartes, *Méditations métaphysiques*, *Discours de la méthode*.
 */

const DUALISM = {
  cogitans: {
    type: 'res_cogitans',
    description: 'Substance pensante — l\'agent, la conscience, le raisonnement',
    properties: {
      thinking: true,
      selfAwareness: true,
      doubt: 'methodical',
    },
  },
  extensa: {
    type: 'res_extensa',
    description: 'Substance étendue — le workspace, le corps, le monde physique',
    properties: {
      spatial: true,
      measurable: true,
      divisible: true,
    },
  },
};

/**
 * cogito — le cogito cartésien : "Je pense, donc je suis".
 * La certitude de l'existence de l'agent par la pensée.
 */
function cogito({ agent }) {
  if (!agent) throw new Error('cartesianService.cogito requires an agent');
  return {
    agentId: agent.id,
    cogito: 'Cogito, ergo sum — Je pense, donc je suis',
    certainty: 'absolute',
    foundation: 'self-awareness',
    description: `L'agent ${agent.id} est certain de son existence par la pensée.`,
  };
}

/**
 * methodicalDoubt — le doute méthodique cartésien.
 * Ne croire que ce qui est clair et distinct, rejeter tout ce qui est incertain.
 */
function methodicalDoubt({ agent, belief }) {
  if (!agent || !belief) throw new Error('cartesianService.methodicalDoubt requires agent and belief');
  const clarity = belief.clarity || 'unclear';
  const distinctness = belief.distinctness || 'confused';
  const certain = clarity === 'clear' && distinctness === 'distinct';
  return {
    agentId: agent.id,
    belief,
    clarity,
    distinctness,
    accepted: certain,
    status: certain ? 'clear-and-distinct-candidate' : 'held-for-methodical-doubt',
    method: 'doute méthodique',
    limitation: 'Clarté et distinction sont des critères déclarés ; cette analyse ne vérifie pas la vérité de la croyance.',
    description: certain
      ? `La croyance "${belief.id || belief}" est claire et distincte → acceptée.`
      : `La croyance "${belief.id || belief}" n'est pas claire/distincte → rejetée.`,
  };
}

/**
 * dualism — évalue l'interaction entre res cogitans et res extensa.
 * Le dualisme cartésien : l'esprit et le corps sont deux substances distinctes
 * qui interagissent via la glande pinéale.
 */
function dualism({ agent }) {
  if (!agent) throw new Error('cartesianService.dualism requires an agent');
  const cogitans = agent.consciousness_state || agent.status || 'unknown';
  const extensa = agent.workspace_id || 'unknown';
  return {
    agentId: agent.id,
    cogitans: {
      substance: 'res_cogitans',
      state: cogitans,
      role: 'thinking_substance',
    },
    extensa: {
      substance: 'res_extensa',
      state: extensa,
      role: 'extended_substance',
    },
    interaction: {
      mechanism: 'glande_pineale',
      direction: 'bidirectional',
      description: 'L\'esprit (cogitans) agit sur le corps (extensa) et réciproquement via la glande pinéale.',
    },
    description: `Dualisme cartésien : l'agent ${agent.id} est à la fois res cogitans (pensante) et res extensa (étendue).`,
  };
}

/**
 * clearAndDistinct — évaluation de la clarté et distinction d'une idée.
 * Critère cartésien de vérité : une idée est vraie si elle est claire et distincte.
 */
function clearAndDistinct({ idea }) {
  if (!idea) throw new Error('cartesianService.clearAndDistinct requires an idea');
  const clarity = idea.clarity || 0;
  const distinctness = idea.distinctness || 0;
  const isClear = clarity >= 0.8;
  const isDistinct = distinctness >= 0.8;
  return {
    idea,
    clarity,
    distinctness,
    isClear,
    isDistinct,
    true: isClear && isDistinct,
    criterion: 'claire et distincte',
    description: isClear && isDistinct
      ? `L'idée est claire et distincte → vraie (critère cartésien).`
      : `L'idée n'est pas assez claire/distincte → incertaine.`,
  };
}

module.exports = {
  DUALISM,
  cogito,
  methodicalDoubt,
  dualism,
  clearAndDistinct,
};
