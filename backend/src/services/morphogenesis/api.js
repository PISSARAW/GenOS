'use strict';

const {
  topologyExpression,
  nestExpression,
  sequenceExpression,
  federateExpression,
  ensureExpression,
} = require('./expression/morphologyExpression');

/**
 * Construit une expression de topologie `Trinity` portant une hypothèse.
 * @param {object} options
 * @param {string} options.hypothesis
 * @returns {object} expression morphologique valide (kind TOPOLOGY)
 */
function trinity(options = {}) {
  return topologyExpression('Trinity', null, {
    metadata: { hypothesis: options.hypothesis },
  });
}

/**
 * Construit une expression de topologie `Holobionte` (hôte + symbiotes).
 * @param {object} options
 * @param {string} options.host
 * @param {string[]} options.symbionts
 * @returns {object} expression morphologique valide (kind TOPOLOGY)
 */
function holobionte(options = {}) {
  return topologyExpression('Holobionte', null, {
    metadata: { host: options.host, symbionts: options.symbionts },
  });
}

/**
 * Construit une expression de topologie `Biocenose` (communauté à quorum).
 * @param {object} options
 * @param {string[]} options.community
 * @param {number} options.quorum
 * @returns {object} expression morphologique valide (kind TOPOLOGY)
 */
function biocenose(options = {}) {
  return topologyExpression('Biocenose', null, {
    metadata: { community: options.community, quorum: options.quorum },
  });
}

/**
 * Construit une expression de topologie `Syncytium` (nuclées + intervalle de synchro).
 * @param {object} options
 * @param {string[]} options.nuclei
 * @param {number} options.syncIntervalMs
 * @returns {object} expression morphologique valide (kind TOPOLOGY)
 */
function syncytium(options = {}) {
  return topologyExpression('Syncytium', null, {
    metadata: { nuclei: options.nuclei, syncIntervalMs: options.syncIntervalMs },
  });
}

/**
 * Imbrique une morphologie `inner` dans l'autorité de l'hôte `host`.
 * @param {object} host expression morphologique
 * @param {object} inner expression morphologique
 * @returns {object} expression morphologique valide (kind NEST)
 */
function nest(host, inner) {
  return nestExpression(host, inner);
}

/**
 * Construit une séquence de pas { morphology, gate }.
 * Les morphologies forment les enfants SEQUENCE ; les gates sont conservées
 * dans les métadonnées du nœud séquence, dans le même ordre.
 * @param {object[]} steps
 * @returns {object} expression morphologique valide (kind SEQUENCE)
 */
function sequence(steps = []) {
  const children = steps.map((step) => ensureExpression(step.morphology));
  return sequenceExpression(children, {
    metadata: { steps: steps.map((step) => ({ gate: step.gate })) },
  });
}

/**
 * Calcule le nombre de membres requis pour le quorum d'une fédération.
 * - fraction dans (0, 1) → convertie en count = ceil(quorum * nbMembres)
 * - nombre >= 1         → utilisé tel quel
 * - absent              → majorité simple (ceil(nbMembres / 2))
 * @param {number|undefined} quorum
 * @param {number} count
 * @returns {number}
 */
function computeQuorum(quorum, count) {
  if (typeof quorum === 'number' && quorum > 0 && quorum < 1) {
    return Math.max(1, Math.ceil(quorum * count));
  }
  if (typeof quorum === 'number' && quorum >= 1) {
    return quorum;
  }
  return Math.max(1, Math.ceil(count / 2));
}

/**
 * Fédère plusieurs morphologies sous un contrat de gouvernance partagé.
 * @param {object[]} members expressions morphologiques (>= 2)
 * @param {object} governance { quorum, rights, disputeResolution, exitPolicy }
 * @returns {object} expression morphologique valide (kind FEDERATE)
 */
function federate(members = [], governance = {}) {
  const memberExpressions = members.map(ensureExpression);
  return federateExpression(memberExpressions, {
    quorum: computeQuorum(governance.quorum, memberExpressions.length),
    metadata: {
      rights: governance.rights,
      disputeResolution: governance.disputeResolution,
      exitPolicy: governance.exitPolicy,
    },
  });
}

module.exports = {
  federate,
  nest,
  holobionte,
  sequence,
  trinity,
  biocenose,
  syncytium,
  computeQuorum,
};
