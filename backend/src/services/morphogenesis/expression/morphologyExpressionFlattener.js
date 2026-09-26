'use strict';

function nodeKindFor(expr) {
  if (expr.nodeKind) return expr.nodeKind;
  if (expr.kind === 'TOPOLOGY') return 'TOPOLOGY';
  if (expr.kind === 'GATE') return 'GATE';
  if (expr.kind === 'BRIDGE') return 'ADAPTER';
  if (expr.kind === 'WRAP') return 'ENVIRONMENT';
  return 'OPERATOR';
}

function operatorFor(expr) {
  if (expr.kind === 'TOPOLOGY') return null;
  return expr.kind;
}

function baseNodeFields(expr, nodeId, parentId) {
  return {
    nodeId,
    kind: nodeKindFor(expr),
    topology: expr.topology || null,
    variant: expr.variant || null,
    operator: operatorFor(expr),
    parentNodeId: parentId,
    children: [],
    scope: expr.scope || 'mission',
    mission: expr.mission || null,
    budget: expr.budget || {},
    workers: expr.workers || [],
    capabilities: expr.capabilities || [],
    observables: expr.observables || [],
    authorityBoundary: expr.authorityBoundary || null,
    stateBoundary: expr.stateBoundary || null,
    evidencePolicy: expr.evidencePolicy || null,
    communicationPolicy: expr.communicationPolicy || null,
    resourcePolicy: expr.resourcePolicy || null,
    lifecyclePolicy: expr.lifecyclePolicy || null,
    lifecycle: 'proposed'
  };
}

function portFields(ports, type) {
  if (!Array.isArray(ports)) return [];
  return ports
    .filter((port) => !port.type || port.type === type)
    .map((port) => ({ ...port, type }));
}

function typedPorts(expr) {
  const generic = Array.isArray(expr.ports) ? expr.ports : [];
  return {
    inputPorts: [...portFields(expr.inputPorts, 'INPUT'), ...portFields(generic, 'INPUT')],
    outputPorts: [...portFields(expr.outputPorts, 'OUTPUT'), ...portFields(generic, 'OUTPUT')],
    statePorts: [...portFields(expr.statePorts, 'STATE'), ...portFields(generic, 'STATE')],
    evidencePorts: [...portFields(expr.evidencePorts, 'EVIDENCE'), ...portFields(generic, 'EVIDENCE')],
    controlPorts: [...portFields(expr.controlPorts, 'CONTROL'), ...portFields(generic, 'CONTROL')],
    resourcePorts: [...portFields(expr.resourcePorts, 'RESOURCE'), ...portFields(generic, 'RESOURCE')]
  };
}

function extraFields(expr) {
  return {
    environment: expr.environment || null,
    adapter: expr.adapter || null,
    condition: expr.condition && expr.condition.kind ? null : expr.condition || null,
    quorum: expr.quorum ?? null,
    selector: expr.selector || null,
    mergeStrategy: expr.mergeStrategy || null,
    localProfile: expr.localProfile || null
  };
}

function subBudget(budget, count) {
  if (!budget || typeof budget !== 'object') return {};
  if (!count || count <= 1) return { ...budget };
  const share = {};
  for (const key of Object.keys(budget)) share[key] = budget[key];
  for (const key of Object.keys(share)) {
    if (Number.isFinite(share[key])) share[key] = share[key] / count;
  }
  return share;
}

function childCountFor(expr) {
  if (expr.kind === 'NEST') return 2;
  if (expr.kind === 'GATE') return 3;
  if (expr.kind === 'WRAP') return 1;
  if (expr.kind === 'BRIDGE') return 2;
  if (expr.kind === 'FEDERATE' && Array.isArray(expr.members)) return expr.members.length;
  if (Array.isArray(expr.children) && expr.children.length > 0) return expr.children.length;
  if (Array.isArray(expr.members)) return expr.members.length;
  return 0;
}

function visitChildren(expr, nodeId, visit) {
  const count = Math.max(1, childCountFor(expr));
  const share = subBudget(expr.budget, count);
  const link = (child) => visit(child, nodeId, share);
  if (expr.kind === 'NEST') return [link(expr.host), link(expr.inner)];
  if (expr.kind === 'GATE') return [link(expr.condition), link(expr.thenBranch), link(expr.elseBranch)];
  if (expr.kind === 'WRAP') return [link(expr.inner)];
  if (expr.kind === 'BRIDGE') return [link(expr.source), link(expr.target)];
  if (expr.kind === 'FEDERATE') return (expr.members || []).map(link);
  if (Array.isArray(expr.children)) return expr.children.map(link);
  return [];
}

function flattenExpression(expr, options = {}) {
  const nodes = [];
  const edges = [];
  const counter = { value: 0 };

  function visit(node, parentId, inheritedBudget) {
    const ctx = { node, parentId, inheritedBudget, counter, nodes, edges };
    const nodeId = nextNodeId(ctx);
    const flatNode = buildFlatNode(ctx, nodeId);
    nodes.push(flatNode);
    linkParent(ctx, nodeId);
    flatNode.children = visitChildren(node, nodeId, visit);
    return nodeId;
  }

  visit(expr, null, options.inheritedBudget);
  return { nodes, edges };
}

function nextNodeId(ctx) {
  const id = `node_${ctx.counter.value}`;
  ctx.counter.value += 1;
  return id;
}

function buildFlatNode(ctx, nodeId) {
  const expr = { ...ctx.node };
  if (ctx.inheritedBudget && (!expr.budget || Object.keys(expr.budget).length === 0)) {
    expr.budget = { ...ctx.inheritedBudget };
  }
  return { ...baseNodeFields(expr, nodeId, ctx.parentId), ...typedPorts(expr), ...extraFields(expr) };
}

function linkParent(ctx, nodeId) {
  if (!ctx.parentId) return;
  ctx.edges.push({
    edgeId: `edge_${ctx.parentId}_${nodeId}`,
    type: 'CONTAINS',
    fromNodeId: ctx.parentId,
    toNodeId: nodeId
  });
}

module.exports = { flattenExpression };