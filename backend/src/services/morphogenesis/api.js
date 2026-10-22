'use strict';

const {
  topologyExpression,
  nestExpression,
  parallelExpression,
  sequenceExpression,
  gateExpression,
  competeExpression,
  wrapExpression,
  bridgeExpression,
  federateExpression,
  ensureExpression,
} = require('./expression/morphologyExpression');

function extractExpressionOptions(options = {}) {
  const { variant = null, scope, mission, budget, ports, ...metadata } = options;
  return { variant, options: { scope, mission, budget, ports, metadata } };
}

function buildTopology(name, options = {}) {
  const { variant, options: exprOptions } = extractExpressionOptions(options);
  return topologyExpression(name, variant, exprOptions);
}

/**
 * Construit une expression de topologie `Trinity` portant une hypothèse.
 */
function trinity(options = {}) {
  return buildTopology('Trinity', options);
}

/**
 * Construit une expression de topologie `ATeam` (rôles spécialisés).
 */
function aTeam(options = {}) {
  return buildTopology('ATeam', options);
}

/**
 * Construit une expression de topologie `Biome` (écosystème de ressources).
 */
function biome(options = {}) {
  return buildTopology('Biome', options);
}

/**
 * Construit une expression de topologie `Biocenose` (communauté à quorum).
 */
function biocenose(options = {}) {
  return buildTopology('Biocenose', options);
}

/**
 * Construit une expression de topologie `Holobionte` (hôte + symbiotes).
 */
function holobionte(options = {}) {
  return buildTopology('Holobionte', options);
}

/**
 * Construit une expression de topologie `Syncytium` (nuclées + intervalle de synchro).
 */
function syncytium(options = {}) {
  return buildTopology('Syncytium', options);
}

/**
 * Construit une expression de topologie `Rhizome` (exploration décentralisée).
 */
function rhizome(options = {}) {
  return buildTopology('Rhizome', options);
}

/**
 * Construit une expression de topologie `Metapopulation` (populations isolées).
 */
function metapopulation(options = {}) {
  return buildTopology('Metapopulation', options);
}

/**
 * Imbrique une morphologie `inner` dans l'autorité de l'hôte `host`.
 */
function nest(host, inner, options = {}) {
  return nestExpression(host, inner, options);
}

/**
 * Exécute plusieurs morphologies indépendantes en parallèle.
 */
function parallel(children = [], options = {}) {
  const { mergePolicy, ...rest } = options;
  const metadata = mergePolicy !== undefined ? { ...(rest.metadata || {}), mergePolicy } : rest.metadata;
  return parallelExpression(children.map(ensureExpression), { ...rest, metadata });
}

/**
 * Construit une séquence de pas { morphology, gate } ou d'expressions directes.
 */
function sequence(steps = [], options = {}) {
  const children = steps.map((step) => ensureExpression(step && step.morphology ? step.morphology : step));
  return sequenceExpression(children, {
    ...options,
    metadata: {
      ...(options.metadata || {}),
      steps: steps.map((step) => ({ gate: step && step.gate !== undefined ? step.gate : null })),
    },
  });
}

/**
 * Ramification conditionnelle GATE(condition, thenBranch, elseBranch).
 */
function gate(condition, thenBranch, elseBranch) {
  if (condition && condition.condition && condition.thenBranch && condition.elseBranch) {
    return gateExpression(condition);
  }
  return gateExpression({ condition, thenBranch, elseBranch });
}

/**
 * Place plusieurs morphologies en concurrence sous un sélecteur.
 */
function compete(children = [], selectorOrOptions = {}) {
  const options = typeof selectorOrOptions === 'string'
    ? { metadata: { selector: selectorOrOptions } }
    : selectorOrOptions;
  return competeExpression(children.map(ensureExpression), options);
}

/**
 * Enveloppe une morphologie dans un environnement contextuel.
 */
function wrap(inner, environment, options = {}) {
  return wrapExpression(inner, environment, options);
}

/**
 * Crée un pont inter-topologique BRIDGE(source, target, adapter).
 */
function bridge(source, target, adapter) {
  if (source && source.source && source.target && source.adapter) {
    return bridgeExpression(source);
  }
  return bridgeExpression({ source, target, adapter });
}

/**
 * Calcule le nombre de membres requis pour le quorum d'une fédération.
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
 */
function federate(members = [], governance = {}) {
  const memberExpressions = members.map((item) => ensureExpression(item && (item.morphology || item.topology) ? (item.morphology || item.topology) : item));
  const weights = members.map((item) => (item && typeof item.weight === 'number' ? item.weight : null));
  return federateExpression(memberExpressions, {
    quorum: computeQuorum(governance.quorum, memberExpressions.length),
    metadata: {
      rights: governance.rights,
      disputeResolution: governance.disputeResolution,
      exitPolicy: governance.exitPolicy,
      joinPolicy: governance.joinPolicy,
      ...(weights.some((w) => w !== null) ? { weights } : {}),
    },
  });
}

module.exports = {
  trinity,
  aTeam,
  biome,
  biocenose,
  holobionte,
  syncytium,
  rhizome,
  metapopulation,
  nest,
  parallel,
  sequence,
  gate,
  compete,
  wrap,
  bridge,
  federate,
  computeQuorum,
};
