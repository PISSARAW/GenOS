'use strict';

// Semantic validity of a procedural graph — separated from the schema
// validator (proceduralIdentityService.validateOrganism). A schema-valid
// graph can still be non-executable: unreachable nodes, no terminal on a
// path from the entrypoint, required gates that can never fire.
//
// Conventions (spec/PROCEDURAL_ORGANISM_SPEC.md):
// - entrypoint = first node in structure.nodes
// - terminal   = node with type 'terminal'
// - required gate = node with type 'gate' AND required === true
// - a node is reachable when a directed path of synapses leads to it
//   from the entrypoint (synapse conditions are ignored here: semantics
//   is structural reachability, not runtime condition evaluation)

function collectNodeIds(nodes) {
  return new Set((nodes || []).map((n) => n.id));
}

function buildAdjacency(synapses) {
  const adjacency = new Map();
  for (const s of synapses || []) {
    if (!adjacency.has(s.from)) adjacency.set(s.from, []);
    adjacency.get(s.from).push(s.to);
  }
  return adjacency;
}

function reachableFrom(entryId, adjacency) {
  const visited = new Set();
  if (entryId == null) return visited;
  const queue = [entryId];
  visited.add(entryId);
  while (queue.length) {
    const current = queue.shift();
    for (const next of adjacency.get(current) || []) {
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return visited;
}

function validateEntryAndTerminal(nodes, reachable, errors) {
  const entry = nodes && nodes[0];
  if (!entry) return;
  const terminals = (nodes || []).filter((n) => n.type === 'terminal');
  if (!terminals.length) {
    errors.push('semantics: graph has no terminal node');
    return;
  }
  for (const terminal of terminals) {
    if (!reachable.has(terminal.id)) {
      errors.push(`semantics: terminal '${terminal.id}' is not reachable from entrypoint '${entry.id}'`);
    }
  }
}

function validateRequiredGates(nodes, reachable, errors) {
  for (const node of nodes || []) {
    const isRequiredGate = node.type === 'gate' && node.required === true;
    if (isRequiredGate && !reachable.has(node.id)) {
      errors.push(`semantics: required gate '${node.id}' is not reachable from the entrypoint`);
    }
  }
}

function validateReachability(nodes, reachable, errors) {
  const entry = nodes && nodes[0];
  if (!entry) return;
  for (const node of nodes || []) {
    if (node.id !== entry.id && !reachable.has(node.id)) {
      errors.push(`semantics: node '${node.id}' is not reachable from entrypoint '${entry.id}'`);
    }
  }
}

function validateTerminalOutputs({ terminals, nodeIds, synapses }, errors) {
  const terminalIds = new Set(terminals.map((n) => n.id));
  for (const s of synapses) {
    if (terminalIds.has(s.from)) {
      const targetExists = nodeIds.has(s.to);
      const isTerminalExit = s.to === 'DIRECT_TERMINAL';
      if (targetExists || isTerminalExit) {
        errors.push(`semantics: terminal '${s.from}' has an outgoing synapse to '${s.to}'`);
      }
    }
  }
}

function validateGraphSemantics(organism) {
  const errors = [];
  const nodes = organism?.structure?.nodes;
  const synapses = organism?.structure?.synapses;
  if (!Array.isArray(nodes) || !Array.isArray(synapses)) {
    return { valid: false, errors: ['semantics: structure.nodes and structure.synapses must be arrays'] };
  }
  if (!nodes.length) {
    return { valid: false, errors: ['semantics: graph has no nodes'] };
  }

  const entry = nodes[0];
  const nodeIds = collectNodeIds(nodes);
  const adjacency = buildAdjacency(synapses);
  const reachable = reachableFrom(entry.id, adjacency);
  const terminals = nodes.filter((n) => n.type === 'terminal');

  validateEntryAndTerminal(nodes, reachable, errors);
  validateRequiredGates(nodes, reachable, errors);
  validateReachability(nodes, reachable, errors);
  validateTerminalOutputs({ terminals, nodeIds, synapses }, errors);

  return { valid: errors.length === 0, errors };
}

module.exports = {
  validateGraphSemantics,
  reachableFrom,
  buildAdjacency,
};
