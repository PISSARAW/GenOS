'use strict';

/**
 * Spinoza Service — Monisme, Deus sive Natura, conatus.
 *
 * Mapping GenOS :
 *  - Monisme = une seule substance (Dieu ou Nature) — le système GenOS tout entier
 *  - Deus sive Natura = Dieu et Nature sont identiques : la logique du système EST la nature des agents
 *  - Conatus = effort de persistance en être (conatus sese conservandi) — l'agent cherche à maintenir son existence
 *  - Attributes = pensée (cognition) et étendue (workspace)
 *  - Modes = les agents individuels comme modifications de la substance
 *
 * Référence : Spinoza, *Éthique*, *Traité de la réforme de l'entendement*.
 */

/**
 * substanceUnique — décrit le système comme une seule substance spinozienne.
 * Deus sive Natura : Dieu ou Nature — deux noms pour la même substance infinie.
 */
function substanceUnique({ system }) {
  if (!system) throw new Error('spinozaService.substanceUnique requires a system');
  return {
    name: 'Deus sive Natura',
    substance: 'unique',
    infinite: true,
    attributes: ['pensée', 'étendue'],
    modes: system.agents || [],
    nature: 'natura naturans',
    description: `Le système GenOS est une seule substance infinie — Deus sive Natura.`,
  };
}

/**
 * conatus — l'effort de persistance en being d'un agent.
 * "Conatus sese conservandi" — le concret effort de conserver son être.
 */
function conatus({ agent }) {
  if (!agent) throw new Error('spinozaService.conatus requires an agent');
  const vitality = agent.cognitive_budget || agent.energy || 0.5;
  const persistence = vitality > 0.3 ? 'stable' : 'declining';
  return {
    agentId: agent.id,
    conatus: 'conatus sese conservandi',
    vitality,
    persistence,
    effort: vitality > 0.7 ? 'strong' : vitality > 0.3 ? 'moderate' : 'weak',
    description: persistence === 'stable'
      ? `L'agent ${agent.id} maintient son existence avec effort.`
      : `L'agent ${agent.id} peine à maintenir son existence.`,
  };
}

/**
 * attributesSpinoza — les attributs de la substance pensante et étendue.
 * Chaque agent est un mode de la substance unique, exprimé par ces deux attributs.
 */
function attributesSpinoza({ agent }) {
  if (!agent) throw new Error('spinozaService.attributesSpinoza requires an agent');
  return {
    agentId: agent.id,
    pensée: {
      classification: agent.role,
      currentTask: agent.current_task,
      cognitiveBudget: agent.cognitive_budget,
    },
    étendue: {
      workspaceId: agent.workspace_id,
      parent: agent.parent_agent_id,
      status: agent.status,
    },
    description: `L'agent ${agent.id} est un mode de la substance unique — Pensée (cognition) et Étendue (corps).`,
  };
}

/**
 * monismeSystème — évalue le degré de monisme du système.
 * Tous les agents ne font qu'un — ils sont des modes d'une même substance.
 */
function monismeSystème({ agents }) {
  if (!agents || !Array.isArray(agents)) throw new Error('spinozaService.monismeSystème requires agents array');
  const identities = new Set(agents.map(a => a.substanceId || 'genos'));
  return {
    substanceCount: identities.size,
    moniste: identities.size === 1,
    agents: agents.length,
    substance: [...identities],
    description: identities.size === 1
      ? `Le système est moniste — ${agents.length} agents, ${identities.size} substance(s).`
      : `Le système est non-moniste — ${identities.size} substances distinctes.`,
  };
}

module.exports = {
  substanceUnique,
  conatus,
  attributesSpinoza,
  monismeSystème,
};
