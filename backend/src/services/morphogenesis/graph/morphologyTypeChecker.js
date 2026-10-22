'use strict';

const { checkAuthority } = require('../typing/authorityCompatibility');
const { checkState } = require('../typing/stateCompatibility');
const { checkPrivacy } = require('../typing/privacyCompatibility');
const { checkEvidence } = require('../typing/evidenceCompatibility');
const { checkIndependence } = require('../typing/independenceCompatibility');
const { checkResources } = require('../typing/resourceCompatibility');
const { checkLifecycle } = require('../typing/lifecycleCompatibility');
const budgetBarrier = require('../barriers/budgetBarrier');

const ARITY = Object.freeze({
  NEST: { min: 2, max: 2 },
  PARALLEL: { min: 1, max: 32 },
  SEQUENCE: { min: 1, max: 32 },
  GATE: { min: 3, max: 3 },
  COMPETE: { min: 2, max: 16 },
  WRAP: { min: 1, max: 1 },
  BRIDGE: { min: 2, max: 2 },
  FEDERATE: { min: 2, max: 32 }
});

function checkGraph(input) {
  const errors = [];
  if (!input || !input.graph) errors.push('graph is required');
  if (errors.length > 0) return { valid: false, errors };
  const graph = input.graph;
  const contracts = input.contracts || {};
  const results = formalResults();
  checkRoot(graph, errors);
  checkNodes(graph, errors);
  checkFormalCompatibility({
    graph,
    contracts,
    globalBudget: input.globalBudget,
    overcommitRatio: input.config && input.config.overcommitRatio,
    errors,
    results
  });
  return { valid: errors.length === 0, errors, ...results };
}

function formalResults() {
  return {
    authorityCompatible: true,
    stateSemanticsCompatible: true,
    privacyBoundariesCompatible: true,
    evidenceContractCompatible: true,
    independencePreserved: true,
    resourceBudgetValid: true,
    lifecycleCoherent: true
  };
}

function applyCheckResult(errors, results, spec) {
  if (spec.found.length > 0) {
    results[spec.flag] = false;
    errors.push(...spec.found);
  }
}

function hasNumericBudget(raw) {
  if (Number.isFinite(raw)) return true;
  return Boolean(raw && typeof raw === 'object' && Number.isFinite(raw.tokens));
}

function leafNodesOf(nodes) {
  const parentIds = new Set(nodes.map((n) => n.parentNodeId).filter(Boolean));
  return nodes.filter((n) => !parentIds.has(n.nodeId) && (!n.children || n.children.length === 0));
}

function checkOvercommitBudget(context) {
  const { graph, globalBudget, overcommitRatio } = context;
  const budget = globalBudget ?? (graph && graph.globalBudget);
  if (!hasNumericBudget(budget)) return [];
  const ratio = overcommitRatio ?? (graph && graph.overcommitRatio);
  const check = budgetBarrier.check(leafNodesOf(graph.nodes || []), budget, ratio);
  return check.valid ? [] : [check.reason];
}

function checkFormalCompatibility(context) {
  const { graph, contracts, errors, results } = context;
  applyCheckResult(errors, results, { flag: 'authorityCompatible', found: checkAuthority(graph) });
  applyCheckResult(errors, results, { flag: 'stateSemanticsCompatible', found: checkState(graph) });
  applyCheckResult(errors, results, { flag: 'privacyBoundariesCompatible', found: checkPrivacy(graph) });
  applyCheckResult(errors, results, { flag: 'evidenceContractCompatible', found: checkEvidence(graph) });
  applyCheckResult(errors, results, { flag: 'independencePreserved', found: checkIndependence(graph, contracts) });
  const resourceErrors = [...checkResources(graph), ...checkOvercommitBudget(context)];
  applyCheckResult(errors, results, { flag: 'resourceBudgetValid', found: resourceErrors });
  applyCheckResult(errors, results, { flag: 'lifecycleCoherent', found: checkLifecycle(graph, contracts) });
}

function checkRoot(graph, errors) {
  if (!graph.rootNodeId) errors.push('rootNodeId is required');
  const root = graph.nodes.find((node) => node.nodeId === graph.rootNodeId);
  if (!root) errors.push('rootNodeId must reference a node');
}

function checkNodes(graph, errors) {
  for (const node of graph.nodes) checkNode(graph, node, errors);
}

function checkNode(graph, node, errors) {
  checkArity(graph, node, errors);
  checkTopologyNode(node, errors);
  checkPorts(node, errors);
  checkBoundaries(node, errors);
}

function checkArity(graph, node, errors) {
  if (!node.operator) return;
  const rule = ARITY[node.operator];
  if (!rule) errors.push(`unknown operator: ${node.operator}`);
  if (!rule) return;
  const count = childCount(graph, node);
  if (count < rule.min || count > rule.max) {
    errors.push(`${node.operator} requires ${rule.min}-${rule.max} children, got ${count}`);
  }
}

function childCount(graph, node) {
  if (Array.isArray(node.children) && node.children.length > 0) return node.children.length;
  return graph.nodes.filter((child) => child.parentNodeId === node.nodeId).length;
}

function checkTopologyNode(node, errors) {
  if (node.kind !== 'TOPOLOGY') return;
  if (!node.topology || typeof node.topology !== 'string') {
    errors.push(`TOPOLOGY node ${node.nodeId} requires a string topology`);
  }
}

function checkPorts(node, errors) {
  const groups = ['inputPorts', 'outputPorts', 'statePorts', 'evidencePorts', 'controlPorts', 'resourcePorts'];
  for (const group of groups) checkPortGroup(node, group, errors);
}

function checkPortGroup(node, group, errors) {
  const ports = node[group];
  if (ports === undefined) return;
  if (!Array.isArray(ports)) errors.push(`${group} of ${node.nodeId} must be an array`);
}

function checkBoundaries(node, errors) {
  checkBoundaryList(node, 'authorityBoundary', errors);
  checkBoundaryList(node, 'stateBoundary', errors);
}

function checkBoundaryList(node, field, errors) {
  const value = node[field];
  if (value === null || value === undefined) return;
  if (!Array.isArray(value)) errors.push(`${field} of ${node.nodeId} must be an array or null`);
}

module.exports = { ARITY, checkGraph, formalResults, checkFormalCompatibility };
