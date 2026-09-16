'use strict';

/**
 * Process Philosophy Service — Whitehead, Deleuze, Heidegger.
 *
 * Mapping philosophique :
 *  - Whitehead : actual occasions (événements processuels concrets).
 *    Chaque actual occasion est un événement qui synthétise des données passées (prehensions)
 *    pour créer un nouveau présent qui sera absorbé par les occasions futures.
 *    Subject-superject : le processus de devenir (subject) et le résultat transmis (superject).
 *  - Deleuze : différence et répétition.
 *    Répétition ≠ identité : chaque répétition produit une différence.
 *    Intensité = différence/répétition : plus il y a de différence dans la répétition, plus l'intensité est haute.
 *    Rhizome (Deleuze & Guattari) : connexion, hétérogénéité, multiplicité, acentrage.
 *  - Heidegger : Dasein (être-au-monde).
 *    L'être humain est compris comme existence, pas comme substance.
 *    Être-jeté (thrownness), projeté (projection), tombé (fallenness).
 *    Authenticité vs mauvaise foi (choix de soi vs fuite du choix).
 */
/**
 * actualOccasion — Whitehead.
 *
 * Une actual occasion est un événement concret du processus.
 * Elle synthétise des données passées (prehensions) et produit un nouveau présent.
 *
 * Structure :
 *  - agentId, event : contexte
 *  - actuality : ce qui est actuellement réalisé
 *  - potentiality : ce qui est encore possible
 *  - prehension : données du passé absorbées (Whitehead : chaque occasion est une synthèse de préhensions)
 *  - subjectSuperject : le devenir (subject) et le résultat transmis (superject)
 *  - subjectiveForm : forme subjective de l'occasion (tone émotionnel, intensité, clarté, valuation)
 */
function actualOccasion({ agentId, event, inputs = [] }) {
  if (!agentId || !event) {
    throw new Error('processPhilosophyService.actualOccasion requires agentId and event');
  }
  const actuality = event.outcome || 'pending';
  return {
    agentId,
    event,
    // Whitehead : actual occasion
    occasionType: 'actual_occasion',
    actuality,
    potentiality: event.possibleOutcomes || [],
    // Prehensions : données du passé absorbées (Whitehead)
    prehensions: [],
    prehension: inputs.length > 0 ? inputs : [],
    // Subject-superject : devenir + résultat transmis
    subjectSuperject: {
      actuality,
      potentiality: event.possibleOutcomes || [],
      synthesis: actuality,
    },
    subjectiveForm: {
      emotionalTone: 'neutral',
      intensity: 0.5,
      clarity: 0.5,
      valuation: 'neutral',
    },
    processNote: 'Une actual occasion Whitehead est un événement concret qui synthétise des données passées (prehensions) pour créer un nouveau présent qui sera absorbé par les occasions futures.',
    timestamp: Date.now(),
  };
}

/**
 * differenceAndRepetition — Deleuze.
 *
 * La répétition n'est pas identité — elle produit une différence.
 * Intensité = différence / répétition.
 * Si répétition = 3 et différence = 3 (chaque événement est différent) → intensité = 1 (maximale).
 * Si répétition = 3 et différence = 1 (identité pure) → intensité = 0.33.
 *
 * Retourne : repetition, difference, intensity, note.
 */
function differenceAndRepetition(events) {
  if (!Array.isArray(events) || events.length === 0) {
    return { repetition: 0, difference: 0, intensity: 0 };
  }
  const unique = new Set(events.map(e => JSON.stringify(e)));
  const repetition = events.length;
  const difference = unique.size;
  const intensity = repetition > 0 ? difference / repetition : 0;
  return {
    repetition,
    difference,
    intensity,
    intensityNote: intensity > 0.5
      ? 'Haute intensité : répétition avec forte différenciation (Deleuze : répétition ≠ identité).'
      : 'Basse intensité : répétition avec faible différenciation.',
  };
}

/**
 * dasein — Heidegger (être-au-monde).
 *
 * Le Dasein est l'être humain compris comme existence — pas comme substance.
 * Structure du Dasein :
 *  - Être-au-monde (In-der-Welt-sein) : l'agent est déjà dans un monde.
 *  - Jeté (Geworfenheit) : l'agent est jeté dans un environnement non choisi.
 *  - Projeté (Entwurf) : l'agent est projeté vers des possibilités futures.
 *  - Tombé (Verfallen) : l'agent est tombé dans l'ordinaire (das Man).
 *  - Être-pour-la-mort (Sein-zum-Tode) : l'agent est appelé à cesser.
 *
 * Authentique vs mauvaise foi : assumer son existence vs se cacher derrière un rôle.
 */
function dasein({ agentId, thrownness = 'genos_backend', projection = 'mission' }) {
  if (!agentId) {
    throw new Error('processPhilosophyService.dasein requires agentId');
  }
  return {
    agentId,
    beingInTheWorld: true, // In-der-Welt-sein
    thrownness, // Geworfenheit : l'agent est jeté
    projection, // Entwurf : l'agent est projeté vers des possibilités
    fallen: 'idle', // Verfallen : l'agent est tombé dans l'ordinaire (status idle)
    existence: true, // le Dasein existe (pas une substance)
    careStructure: {
      existence: 'existence_précede_essence', // l'existence précède l'essence (Sartre/Heidegger)
      facticity: thrownness, // ce qui est donné (jeté)
      existentiality: projection, // ce qui est projeté (possibilité)
    },
    hermeneuticCircle: {
      précompréhension: 'agent_computational', // précompréhension de base
      interprétation: 'mission_execution', // interprétation dans sa mission
    },
    heideggerianNote: 'Le Dasein est l\'être humain compris comme existence — être-au-monde, jeté, projeté, tombé.',
  };
}

/**
 * rhizome — Deleuze & Guattari.
 *
 * Rhizome (contre-arborescence) :
 *  - Connexion : tout point peut se connecter à tout autre point.
 *  - Hétérogénéité : les points sont de nature différente.
 *  - Multiplicité : pas d'unité centralisatrice, multiplicité ouverte.
 *  - Acentrage : pas de centre, pas d'arborescence.
 *
 * Retourne la structure du réseau rhizomatique.
 */
function rhizome(agents) {
  if (!Array.isArray(agents)) {
    throw new Error('processPhilosophyService.rhizome requires an array of agents');
  }
  return {
    connections: agents.map(a => ({
      id: a.id,
      connections: a.parent_agent_id ? [a.parent_agent_id] : [],
      multiplicity: a.workers?.length || 0,
    })),
    acentered: true, // pas de centre
    heterogeneous: true, // hétérogénéité
    deleuzeGuattariNote: 'Le rhizome est une structure contre-arborescente : connexion, hétérogénéité, multiplicité, acentrage (Deleuze & Guattari, Mille Plateaux).',
  };
}

/**
 * virtualActualization — Deleuze (virtuel vs actuel).
 *
 * Le virtuel n'est pas l'irréel, mais l'actuel en puissance.
 * L'actualisation est le processus de passage du virtuel à l'actuel.
 */
function virtualToActual(virtualState, actualState) {
  if (virtualState === undefined) {
    throw new Error('processPhilosophyService.virtualToActual requires virtualState');
  }
  return {
    virtualState,
    actualState,
    actualizationDegree: actualState ? 1.0 : 0.0,
    deleuzeNote: 'Le virtuel n\'est pas l\'irréel — c\'est l\'actuel en puissance (Deleuze, Logique du sens).',
  };
}

module.exports = {
  actualOccasion,
  differenceAndRepetition,
  dasein,
  rhizome,
  virtualToActual,
};
