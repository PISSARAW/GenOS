const { validateWorkflowCondition } = require('../../services/workflowConditions');

function validateGraphStructure(graph) {
  const errors = [];
  if (!graph || typeof graph !== 'object') errors.push('Workflow graph must be an object.');
  if (graph && !Array.isArray(graph.nodes)) errors.push('Workflow nodes must be an array.');
  if (graph && !Array.isArray(graph.edges)) errors.push('Workflow edges must be an array.');
  return errors;
}

function validateNodeIds(nodes, errors) {
  const validNodes = nodes.filter((node) => node && typeof node === 'object');
  const ids = new Set(validNodes.map((node) => node.id).filter((id) => typeof id === 'string' && id.trim()));
  if (nodes.length === 0) errors.push('Workflow must contain at least one node.');
  if (nodes.some((node) => !node || typeof node.id !== 'string' || !node.id.trim())) errors.push('Every workflow node must have a non-empty string id.');
  if (new Set(validNodes.map((node) => node.id)).size !== validNodes.length) errors.push('Node ids must be unique.');
  return { validNodes, ids };
}

function validateEdges(edges, ids, errors) {
  const edgeIds = new Set();
  const edgeKeys = new Set();
  edges.forEach((edge) => {
    if (!edge || typeof edge !== 'object') { errors.push('Every workflow edge must be an object.'); return; }
    if (edge.id !== undefined) {
      if (typeof edge.id !== 'string' || !edge.id.trim()) errors.push('Workflow edge ids must be non-empty strings.');
      else if (edgeIds.has(edge.id)) errors.push(`Edge id '${edge.id}' must be unique.`);
      else edgeIds.add(edge.id);
    }
    if (!ids.has(edge.source) || !ids.has(edge.target)) errors.push(`Edge ${edge.id || '(unnamed)'} references an unknown node.`);
    if (edge.source === edge.target && ids.has(edge.source)) errors.push(`Edge ${edge.id || '(unnamed)'} cannot point to its own node.`);
    const edgeKey = `${String(edge.source)}\u0000${String(edge.target)}`;
    if (edgeKeys.has(edgeKey)) errors.push(`Duplicate edge from '${edge.source}' to '${edge.target}'.`);
    else edgeKeys.add(edgeKey);
  });
}

function detectCycleInGraph(validNodes, edges) {
  const adjacency = new Map(validNodes.map((node) => [node.id, []]));
  edges.forEach((edge) => { if (edge && adjacency.has(edge.source) && adjacency.has(edge.target)) adjacency.get(edge.source).push(edge.target); });
  const visiting = new Set(); const visited = new Set();
  const hasCycle = (id) => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    if ((adjacency.get(id) || []).some(hasCycle)) return true;
    visiting.delete(id); visited.add(id); return false;
  };
  return validNodes.some((node) => hasCycle(node.id));
}

function validateConditionsAndIterations(nodes, errors) {
  nodes.forEach((node) => {
    if (!node || typeof node !== 'object') return;
    const condition = node.when || node.data?.when;
    if (condition && !validateWorkflowCondition(condition)) errors.push(`Node ${node.id} has an unsupported condition.`);
    const iterations = node.max_iterations ?? node.data?.maxIterations;
    if (iterations != null && (!Number.isInteger(Number(iterations)) || Number(iterations) < 0 || Number(iterations) > 20)) errors.push(`Node ${node.id} maxIterations must be an integer between 0 and 20.`);
  });
}

function validateIncomingEdges(validNodes, edges, errors) {
  const incoming = new Set(edges.filter((edge) => Boolean(edge && typeof edge === 'object')).map((edge) => edge.target));
  if (validNodes.length > 1 && validNodes.some((node) => !incoming.has(node.id) && node.type !== 'trigger' && node.type !== 'input')) {
    errors.push('Every non-trigger node must have an incoming edge.');
  }
}

function validateModelRequirements(validNodes, errors) {
  const requiresModel = (node) => /\b(llm|agent|model)\b/i.test([node.kind, node.data?.kind, node.data?.label, node.type].filter(Boolean).join(' '));
  validNodes.filter(requiresModel).forEach((node) => {
    if (!(node.model || node.data?.model || node.modelRouting?.primary || node.data?.modelRouting?.primary || process.env.GENOS_DEFAULT_MODEL)) {
      errors.push(`Node ${node.id} requires a real model URI or GENOS_DEFAULT_MODEL.`);
    }
  });
}

function validateGraph(graph) {
  const errors = validateGraphStructure(graph);
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  const { validNodes, ids } = validateNodeIds(nodes, errors);
  validateEdges(edges, ids, errors);
  if (detectCycleInGraph(validNodes, edges)) errors.push('Workflow graph must be acyclic.');
  validateConditionsAndIterations(nodes, errors);
  validateIncomingEdges(validNodes, edges, errors);
  validateModelRequirements(validNodes, errors);
  return { valid: errors.length === 0, errors, nodeCount: nodes.length, edgeCount: edges.length };
}

module.exports = { validateGraph };
