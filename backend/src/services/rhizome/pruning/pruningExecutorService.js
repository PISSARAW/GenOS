'use strict';

const planner = require('./pruningService');
const { normalizeRhizomeSession } = require('../contracts/rhizomeSession');

function apply(session, plan, options = {}) {
  assertCurrentPlan(session, plan, options);
  const next = structuredClone(session);
  const fossils = [];
  applyEdgeDispositions(next, plan.edgeDispositions, fossils);
  applyNodeDispositions(next, plan.nodeDispositions, fossils);
  next.graphVersion += 1;
  normalizeRhizomeSession(next);
  Object.assign(session, next);
  return { graphVersion: session.graphVersion, retiredEdgeIds: plan.edgeDispositions.filter(isRetired).map((item) => item.edgeId), retiredNodeIds: plan.nodeDispositions.filter(isRetired).map((item) => item.nodeId), fossils };
}

function assertCurrentPlan(session, plan, options) {
  if (!plan || plan.graphVersion !== session.graphVersion) {
    throw Object.assign(new Error('Rhizome pruning plan is stale.'), { code: 'RHIZOME_PRUNING_STALE' });
  }
  const current = planner.inspect(session, options);
  if (!matchesPlan(current, plan)) {
    throw Object.assign(new Error('Rhizome pruning plan differs from the current safe proposal.'), { code: 'RHIZOME_PRUNING_PLAN_INVALID' });
  }
}

function matchesPlan(current, supplied) {
  return sameActions(current.edgeDispositions, supplied.edgeDispositions, 'edgeId')
    && sameActions(current.nodeDispositions, supplied.nodeDispositions, 'nodeId');
}

function sameActions(expected, supplied, key) {
  if (!Array.isArray(supplied) || expected.length !== supplied.length) return false;
  const actions = new Map(supplied.map((item) => [item[key], item.action]));
  return expected.every((item) => actions.get(item[key]) === item.action);
}

function applyEdgeDispositions(session, dispositions, fossils) {
  const actions = new Map(dispositions.map((item) => [item.edgeId, item]));
  session.edges = session.edges.map((edge) => {
    const disposition = actions.get(edge.edgeId);
    if (!disposition || disposition.action === 'DORMANT') return edge;
    if (disposition.fossil) fossils.push(disposition.fossil);
    return { ...edge, status: 'RETIRED' };
  });
}

function applyNodeDispositions(session, dispositions, fossils) {
  const actions = new Map(dispositions.map((item) => [item.nodeId, item]));
  const retired = new Set();
  session.nodes = session.nodes.map((node) => {
    const disposition = actions.get(node.nodeId);
    if (!disposition || disposition.action === 'DORMANT') return node;
    if (disposition.action === 'FOSSILIZE') fossils.push({ nodeId: node.nodeId, protectedCapabilities: disposition.protectedCapabilities });
    retired.add(node.nodeId);
    return { ...node, state: 'RETIRED' };
  });
  session.edges = session.edges.map((edge) => retired.has(edge.from) || retired.has(edge.to)
    ? { ...edge, status: 'RETIRED' }
    : edge);
}

function isRetired(item) {
  return item.action === 'PRUNE' || item.action === 'FOSSILIZE';
}

module.exports = { apply };
