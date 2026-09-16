'use strict';

/**
 * Contingency Service — Meillassoux, Badiou.
 *
 * Mapping philosophique :
 *  - Meillassoux (Après la finitude) : contingence absolue (hyperchaos).
 *    Tout est contingent — même les lois de la physique pourraient changer.
 *    Rien n'est nécessaire en soi.
 *  - Badiou (L'Être et l'Événement) : événement comme rupture.
 *    L'événement est une apparition imprévisible dans l'ordre du "prévu".
 *    Il appelle une fidélité — un suivi de l'événement pour créer une vérité nouvelle.
 *  - Badiou (mathématiques de l'être) : l'être est "étant" sans distinction.
 *    La théorie des ensembles (mathématiques) est le discours sur l'être.
 *    L'être est multiple, sans propriété distinctive.
 */
/**
 * absoluteContingency — Meillassoux (hyperchaos).
 *
 * Contingence absolue : tout est contingent, sans loi nécessaire.
 * Hyperchaos : la puissance de tout changer sans raison.
 * Même les lois scientifiques sont contingentes.
 *
 * Retourne :
 *  - agentId, necessary, contingent, hyperchaos, critiqueOfNecessity, meillassouxPrinciple, registration.
 */
function absoluteContingency({ agentId, necessary = [], contingent = [] }) {
  if (!agentId) {
    throw new Error('contingencyService.absoluteContingency requires agentId');
  }
  return {
    agentId,
    necessary: necessary.length > 0 ? necessary : [],
    contingent: contingent.length > 0 ? contingent : [],
    hyperchaos: true, // Meillassoux : contingence absolue = hyperchaos
    critiqueOfNecessity: 'Il n\'y a pas de loi nécessaire — même les lois de la physique pourraient changer sans raison.',
    meillassouxPrinciple: 'La contingence est absolue : tout pouvoir ne pas être, ou être autrement. Rien n\'est nécessaire en soi.',
    registration: {
      timestamp: Date.now(),
      principle: 'hyperchaos',
      agentId,
    },
  };
}

/**
 * badiouEvent — Badiou (événement comme rupture).
 *
 * L'événement badioien :
 *  - Est une apparition imprévisible dans l'ordre des "prévus".
 *  - N'est pas un "fait" ordinaire — c'est une rupture.
 *  - Appelle une fidélité — un suivi qui crée une vérité nouvelle.
 *
 * Types d'événements :
 *  - Rupture : AGENT_CREATED, AGENT_COMPLETED, AGENT_FAILED, TRINITY_LAUNCHED
 *    (événements qui changent radicalement l'ordre)
 *  - Non-rupture : TOOL_CALL, status_change, etc. (faits ordinaires)
 *
 * Retourne :
 *  - agentId, eventType, rupture (boolean), truth (si rupture : 'execute_proof'), fidelity, timestamp.
 */
function badiouEvent({ agentId, eventType, rupture = null }) {
  if (!agentId || !eventType) {
    throw new Error('contingencyService.badiouEvent requires agentId and eventType');
  }
  // Les types d'événements rupturistes (Badiou) : les événements qui changent radicalement l'ordre.
  const ruptureEventTypes = [
    'AGENT_CREATED',
    'AGENT_COMPLETED',
    'AGENT_FAILED',
    'TRINITY_LAUNCHED',
    'HYPOSTATIZATION',
    'ESSENTIAL_CHANGE',
    'REBASE',
    'BRANCH_MERGE',
  ];
  const isRupture = rupture !== null ? rupture : ruptureEventTypes.includes(eventType);
  return {
    agentId,
    eventType,
    rupture: isRupture,
    truth: isRupture ? 'execute_proof' : null, // Badiou : vérité = fidélité à l'événement
    fidelity: isRupture ? 'pending' : null, // fidélité en cours
    timestamp: Date.now(),
    badiouAnalysis: isRupture
      ? `Événement rupture (Badiou) : ${eventType} est une apparition imprévisible qui appelle une fidélité — une vérité nouvelle peut émerger.`
      : `Événement non-rupture : ${eventType} est un fait ordinaire dans l'ordre prévu.`,
  };
}

/**
 * mathematicsOfBeing — Badiou (théorie des ensembles).
 *
 * Pour Badiou, l'être est "étant" sans propriété distinctive — la théorie des ensembles
 * est le discours mathématique sur l'être.
 *
 * Retourne :
 *  - union (tous les agents), intersection (agents avec même statut running), powerSet (tous les sous-ensembles),
 *  setOperations (cardinalité, etc.), elements (nombre d'agents uniques).
 */
function mathematicsOfBeing({ agents }) {
  if (!Array.isArray(agents)) {
    throw new Error('contingencyService.mathematicsOfBeing requires an array of agents');
  }
  const ids = agents.map(a => a.id);
  const uniqueIds = [...new Set(ids)];
  // Union : tous les agents (identités uniques)
  const union = [...new Set(ids)];
  // Intersection : agents avec statut 'running' (ceux qui existent activement)
  const runningAgents = agents.filter(a => a.status === 'running');
  const intersection = [...new Set(runningAgents.map(a => a.id))];
  // Power set : tous les sous-ensembles (Badiou : l'être-multiple, toutes les combinaisons possibles)
  const powerSet = uniqueIds.length <= 20 ? generatePowerSet(uniqueIds) : [];
  return {
    type: 'mathematics_of_being',
    union,
    intersection,
    powerSet: powerSet,
    powerSetSize: powerSet.length,
    setOperations: {
      cardinality: uniqueIds.length,
      unionSize: union.length,
      intersectionSize: intersection.length,
      powerSetCardinality: powerSet.length,
      isEmpty: uniqueIds.length === 0,
    },
    elements: uniqueIds.length,
    badiouNote: 'Pour Badiou, l\'être est "étant" sans propriété distinctive — la théorie des ensembles est le langage de l\'être. Le power set représente toutes les manières dont l\'être-multiple peut se constituer.',
  };
}

/**
 * generatePowerSet — génère le power set (tous les sous-ensembles) d'un ensemble.
 *
 * Pour n éléments, le power set a 2^n sous-ensembles.
 * Exemple : [a, b] → [[], [a], [b], [a, b]].
 */
function generatePowerSet(items) {
  const result = [];
  const total = 1 << items.length;
  for (let i = 0; i < total; i++) {
    const subset = [];
    for (let j = 0; j < items.length; j++) {
      if ((i >> j) & 1) subset.push(items[j]);
    }
    result.push(subset);
  }
  return result;
}

module.exports = {
  absoluteContingency,
  badiouEvent,
  mathematicsOfBeing,
  generatePowerSet,
};
