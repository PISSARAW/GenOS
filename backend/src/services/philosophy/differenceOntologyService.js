'use strict';

function analyzeDifference(input = {}) {
  const first = required(input.first, 'first');
  const second = required(input.second, 'second');
  const differences = Object.keys({ ...first, ...second }).filter((key) => JSON.stringify(first[key]) !== JSON.stringify(second[key]));
  return {
    kind: 'DifferenceAnalysis',
    differences,
    differenceInItself: input.identitySuppressed === true,
    repetition: input.repetition || null,
    simulacrum: input.simulacrum || null,
    status: 'comparative',
    interpretationStatus: 'philosophical_mapping'
  };
}

function analyzeRepetition(input = {}) {
  const events = Array.isArray(input.events) ? input.events : [];
  if (!events.length) throw new Error('events must contain at least one element.');
  const variations = events.slice(1).map((event, index) => ({
    index: index + 1,
    changed: JSON.stringify(event) !== JSON.stringify(events[index]),
    from: events[index],
    to: event
  }));
  return { kind: 'Repetition', events, variations, differenceProduced: variations.some((item) => item.changed), status: 'processual' };
}

function createRhizome(input = {}) {
  const nodes = Array.isArray(input.nodes) ? input.nodes : [];
  const edges = Array.isArray(input.edges) ? input.edges : [];
  const nodeIds = new Set(nodes.map((node) => String(node.id)));
  const invalidEdges = edges.filter((edge) => !nodeIds.has(String(edge.from)) || !nodeIds.has(String(edge.to)));
  return {
    kind: 'Rhizome',
    nodes,
    edges,
    acentered: input.acentered !== false,
    connections: edges.length,
    invalidEdges,
    status: invalidEdges.length ? 'invalid' : 'graph_model'
  };
}

function analyzeAssemblage(input = {}) {
  const components = Array.isArray(input.components) ? input.components : [];
  if (!components.length) throw new Error('components must contain at least one element.');
  return {
    kind: 'Assemblage',
    components,
    relations: Array.isArray(input.relations) ? input.relations : [],
    territory: input.territory || null,
    functions: Array.isArray(input.functions) ? input.functions : [],
    heterogenous: new Set(components.map((component) => component.kind || typeof component)).size > 1,
    status: 'composite'
  };
}

function mapTerritorialization(input = {}) {
  const operation = input.operation || 'deterritorialize';
  if (!['territorialize', 'deterritorialize', 'reterritorialize'].includes(operation)) {
    throw new Error(`Unknown territorialization operation '${operation}'.`);
  }
  const intensity = input.intensity === undefined ? 1 : Number(input.intensity);
  if (!Number.isFinite(intensity) || intensity < 0 || intensity > 1) throw new Error('intensity must be a number between 0 and 1.');
  return {
    operation,
    sourceTerritory: input.sourceTerritory || null,
    targetTerritory: input.targetTerritory || null,
    intensity,
    majorMinor: input.majorMinor || 'undetermined',
    status: 'transformation',
    interpretationStatus: 'philosophical_mapping'
  };
}

function required(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${field} must be an object.`);
  return value;
}

module.exports = { analyzeDifference, analyzeRepetition, createRhizome, analyzeAssemblage, mapTerritorialization };
