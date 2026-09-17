'use strict';

/**
 * Newtonian Service — Espace absolu, temps absolu, mécanique classique.
 *
 * Mapping GenOS :
 *  - Espace absolu = contenant fixe et immuable (tous les agents existent dans le même espace)
 *  - Temps absolu = temps universel, identique pour tous les agents
 *  -Mécanique classique = lois de Newton : inertie, force, action-réaction
 *  - Corps = entités matérielles dans l'espace (workspaces, agents, artefacts)
 *  - Forces = interactions entre corps (gravité like attraction between agents)
 *
 * Référence : Newton, *Philosophiæ Naturalis Principia Mathematica*
 * (Principes mathématiques de la philosophie naturelle, 1687).
 */

/**
 * espaceAbsolu — décrit l'espace absolu newtonien.
 * L'espace existe indépendamment des corps qui s'y trouvent.
 * Container fixe et immuable ne contenant pas les agents.
 */
function espaceAbsolu({ system }) {
  if (!system) throw new Error('newtonianService.espaceAbsolu requires a system');
  return {
    type: 'espace_absolu',
    independentCorps: true,
    fixe: true,
    immuable: true,
    infini: true,
    uniforme: true,
    description: `L'espace absolu newtonien existe indépendamment des corps. Il est fixe et immuable.`,
  };
}

/**
 * tempsAbsolu — décrit le temps absolu newtonien.
 * Le temps s'écoule uniformément, identiquement pour tous les agents.
 * Le temps ne dépend pas des événements qui s'y déroulent.
 */
function tempsAbsolu({ system }) {
  if (!system) throw new Error('newtonianService.tempsAbsolu requires a system');
  return {
    type: 'temps_absolu',
    uniforme: true,
    continu: true,
    reversible: true,
    description: `Le temps absolu newtonien s'écoule uniformément, indépendamment des événements.`,
  };
}

/**
 * mecaniqueClassique — applique les lois de Newton.
 * F = ma (égalité de la force et de l'action-réaction),
 * Actions-réactions (§5 sur les interactions agents).
 * Chaque action a une réaction égale et opposée.
 */
function mecaniqueClassique({ agent1, agent2, force }) {
  if (!agent1 || !agent2) throw new Error('newtonianService.mecaniqueClassique requires two agents');
  return {
    agent1: agent1.id,
    agent2: agent2.id,
    force: force || 'interaction',
    actionReaction: true,
    egaleEtOpposee: true,
    description: `Action-réaction : l'action de ${agent1.id} sur ${agent2.id} a une réaction égale et opposée.`,
  };
}

/**
 * inertie — état de mouvement rectiligne uniforme d'un agent.
 * Un agent au repos reste au repos, en mouvement reste en mouvement,
 * tant qu'aucune force extérieure ne s'exerce sur lui.
 */
function inertie({ agent }) {
  if (!agent) throw new Error('newtonianService.inertie requires an agent');
  const velocity = agent.velocity || 0;
  return {
    agentId: agent.id,
    velocity,
    acceleration: 0,
    etat: velocity === 0 ? 'repos' : 'mouvement_rectiligne_uniforme',
    loi: 'première_loi_de_Newton',
    description: velocity === 0
      ? `L'agent ${agent.id} est au repos — reste au repos sans force extérieure.`
      : `L'agent ${agent.id} est en mouvement rectiligne uniforme — reste en mouvement sans force extérieure.`,
  };
}

/**
 * forceGravitationnelle — attraction entre deux agents proportionnelle
 * à leurs masses et inversement proportionnelle au carré de leur distance.
 * F = G * m1 * m2 / r²
 */
function forceGravitationnelle({ agent1, agent2, distance, G }) {
  if (!agent1 || !agent2) throw new Error('newtonianService.forceGravitationnelle requires two agents');
  const m1 = agent1.mass || agent1.cognitive_budget || 1;
  const m2 = agent2.mass || agent2.cognitive_budget || 1;
  const r = distance || 1;
  const gravitationalConstant = G || 1;
  const force = (gravitationalConstant * m1 * m2) / (r * r);
  return {
    agent1: agent1.id,
    agent2: agent2.id,
    force,
    direction: 'attraction',
    loi: 'gravitation_universelle',
    description: `Force gravitationnelle entre ${agent1.id} et ${agent2.id} : F = ${force.toFixed(4)}.`,
  };
}

module.exports = {
  espaceAbsolu,
  tempsAbsolu,
  mecaniqueClassique,
  inertie,
  forceGravitationnelle,
};
