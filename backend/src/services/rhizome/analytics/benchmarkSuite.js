'use strict';

const routePlanner = require('../routing/routePlanner');

const NEED = Object.freeze({ needId: 'benchmark-need', capability: 'verify' });
const BUDGET_UNITS = 8;

function node(nodeId, capabilities = []) {
  return { nodeId, kind: 'AGENT', capabilities, state: 'ACTIVE', reliability: 0.9 };
}

function edge(edgeId, from, to) {
  return {
    edgeId, from, to, relation: 'ROUTES_TO', status: 'ACTIVE', reliability: 0.9,
    compatibility: 1, conductivity: 1, successRate: 1, evidenceQuality: 1,
    cost: 0, latency: 0, trailState: { positive: 0, negative: 0 }
  };
}

function graph(nodes, edges) {
  return { nodes, edges, coordinationLoci: [{ holderNodeId: 'source' }] };
}

function reachability(value) {
  const result = routePlanner.plan(value, NEED);
  return { reachable: result.selected, route: result.selected ? result.route.nodeIds : [] };
}

function fixedDagScenario() {
  const value = graph([node('source'), node('middle'), node('target', ['verify'])], [edge('a', 'source', 'middle'), edge('b', 'middle', 'target')]);
  const before = reachability(value);
  value.edges[0].status = 'QUARANTINED';
  const after = reachability(value);
  return { name: 'fixed_dag', nodeCount: value.nodes.length, edgeCount: 2, before, after, recovered: after.reachable };
}

function rhizomeScenario() {
  const value = graph([
    node('source'), node('primary'), node('alternate'), node('target', ['verify'])
  ], [
    edge('primary-in', 'source', 'primary'), edge('primary-out', 'primary', 'target'),
    edge('alternate-in', 'source', 'alternate'), edge('alternate-out', 'alternate', 'target')
  ]);
  const before = reachability(value);
  value.edges[0].status = 'QUARANTINED';
  value.edges[1].status = 'QUARANTINED';
  const after = reachability(value);
  return { name: 'rhizome_redundant', nodeCount: value.nodes.length, edgeCount: value.edges.length, before, after, recovered: after.reachable };
}

function growthScenario() {
  const value = graph([node('source')], []);
  const before = reachability(value);
  value.nodes.push(node('sprout', ['verify']));
  value.edges.push(edge('sprout-bridge', 'source', 'sprout'));
  const after = reachability(value);
  return { name: 'verified_growth', nodeCount: value.nodes.length, edgeCount: value.edges.length, before, after, usefulGrowth: !before.reachable && after.reachable };
}

function runSuite() {
  const fixedDag = fixedDagScenario();
  const rhizome = rhizomeScenario();
  const growth = growthScenario();
  const directLookupHit = ['verify'].includes(NEED.capability);
  return {
    benchmark: 'RhizomeV1',
    budgetUnits: BUDGET_UNITS,
    scenarios: [fixedDag, rhizome, growth],
    comparisons: {
      lookupReportsCapabilityWithoutPath: directLookupHit && !growth.before.reachable,
      redundantGraphRecoversFromOneRouteFailure: rhizome.recovered,
      fixedDagRecoversFromOneRouteFailure: fixedDag.recovered,
      growthPrecision: growth.usefulGrowth ? 1 : 0,
      structuralEfficiency: Number((rhizome.after.reachable / (rhizome.nodeCount + rhizome.edgeCount)).toFixed(4))
    }
  };
}

module.exports = { runSuite };
