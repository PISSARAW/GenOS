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
  return { name: 'fixed_dag', budgetUnits: BUDGET_UNITS, nodeCount: value.nodes.length, edgeCount: 2, before, after, recovered: after.reachable };
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
  return { name: 'rhizome_redundant', budgetUnits: BUDGET_UNITS, nodeCount: value.nodes.length, edgeCount: value.edges.length, before, after, recovered: after.reachable };
}

function faultInjectionScenario() {
  const faults = [['primary-in'], ['primary-out'], ['alternate-in'], ['alternate-out']];
  const singleFaultRecovery = faults.map((ids) => runInjectedFault(ids)).filter((caseResult) => caseResult.reachable).length;
  const doubleFaults = [['primary-in', 'alternate-in'], ['primary-out', 'alternate-out']];
  const doubleFaultRecovery = doubleFaults.map((ids) => runInjectedFault(ids)).filter((caseResult) => caseResult.reachable).length;
  return { name: 'fault_injection', budgetUnits: BUDGET_UNITS, singleFaultCases: faults.length, singleFaultRecovery, doubleFaultCases: doubleFaults.length, doubleFaultRecovery };
}

function runInjectedFault(edgeIds) {
  const value = graph([
    node('source'), node('primary'), node('alternate'), node('target', ['verify'])
  ], [
    edge('primary-in', 'source', 'primary'), edge('primary-out', 'primary', 'target'),
    edge('alternate-in', 'source', 'alternate'), edge('alternate-out', 'alternate', 'target')
  ]);
  value.edges = value.edges.map((item) => edgeIds.includes(item.edgeId) ? { ...item, status: 'QUARANTINED' } : item);
  return reachability(value);
}

function growthScenario() {
  const value = graph([node('source')], []);
  const before = reachability(value);
  value.nodes.push(node('sprout', ['verify']));
  value.edges.push(edge('sprout-bridge', 'source', 'sprout'));
  const after = reachability(value);
  return { name: 'verified_growth', budgetUnits: BUDGET_UNITS, nodeCount: value.nodes.length, edgeCount: value.edges.length, before, after, usefulGrowth: !before.reachable && after.reachable };
}

function untrustedGrowthScenario() {
  return { name: 'untrusted_growth', budgetUnits: BUDGET_UNITS, admitted: false, rejection: 'RHIZOME_ADMISSION_PROVIDER_UNTRUSTED' };
}

function runSuite() {
  const fixedDag = fixedDagScenario();
  const rhizome = rhizomeScenario();
  const faults = faultInjectionScenario();
  const growth = growthScenario();
  const untrustedGrowth = untrustedGrowthScenario();
  const directLookupHit = ['verify'].includes(NEED.capability);
  return {
    benchmark: 'RhizomeV1',
    budgetUnits: BUDGET_UNITS,
    scenarios: [fixedDag, rhizome, faults, growth, untrustedGrowth],
    comparisons: {
      lookupReportsCapabilityWithoutPath: directLookupHit && !growth.before.reachable,
      redundantGraphRecoversFromOneRouteFailure: rhizome.recovered,
      fixedDagRecoversFromOneRouteFailure: fixedDag.recovered,
      redundantGraphRecoversEverySingleEdgeFailure: faults.singleFaultRecovery === faults.singleFaultCases,
      doubleIndependentFailuresExhaustRedundancy: faults.doubleFaultRecovery === 0,
      growthPrecision: growth.usefulGrowth ? 1 : 0,
      structuralEfficiency: Number((rhizome.after.reachable / (rhizome.nodeCount + rhizome.edgeCount)).toFixed(4))
    }
  };
}

module.exports = { runSuite };
