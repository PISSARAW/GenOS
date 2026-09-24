'use strict';

const { contractFor } = require('./typingHelpers');

function checkLifecycle(graph, contracts = {}) {
  return (graph.nodes || []).flatMap((node) => lifecycleNodeErrors(node, contracts));
}

function lifecycleNodeErrors(node, contracts) {
  const model = contractFor(node, contracts).lifecycleModel || {};
  const phaseError = checkPhase(node, model.phases);
  const transitionError = checkTransition(node, model.transitions);
  return [phaseError, transitionError].filter(Boolean);
}

function checkPhase(node, phases) {
  if (Array.isArray(phases) && phases.length && !phases.includes(node.lifecycle)) {
    return `node ${node.nodeId} lifecycle is not supported by topology ${node.topology}`;
  }
  return null;
}

function checkTransition(node, transitions) {
  const previous = node.lifecycle && node.lifecycle.previous;
  const current = node.lifecycle && node.lifecycle.current;
  if (!previous || !current || !Array.isArray(transitions)) return null;
  const allowed = transitions.some((entry) => entry.from === previous && entry.to === current);
  return allowed ? null : `node ${node.nodeId} has an unsupported lifecycle transition`;
}

module.exports = { checkLifecycle };
