'use strict';

const { randomUUID } = require('crypto');
const { validateWorkGraph } = require('./graphValidation');
const { analyzeDependencies } = require('./dependencyAnalyzer');
const { criticalPath } = require('./criticalPathService');

function compileWorkGraph(input = {}) {
  const supplied = Array.isArray(input.nodes);
  const graph = {
    workGraphId: input.workGraphId || randomUUID(),
    teamRunId: input.teamRunId || null,
    nodes: supplied ? input.nodes : nodesFromMembers(input.members),
    edges: Array.isArray(input.edges) ? input.edges : edgesFromMembers(input.members, supplied ? input.nodes : null),
    status: 'COMPILED',
    createdAt: input.createdAt || new Date().toISOString()
  };
  assertValid(graph);
  const analysis = analyzeDependencies(graph);
  graph.layers = analysis.layers;
  graph.nodeStages = analysis.nodeStages;
  graph.criticalPath = criticalPath(graph, analysis);
  graph.nodes = graph.nodes.map((node) => ({
    ...node,
    status: analysis.inbound.get(node.nodeId).length ? 'BLOCKED' : 'READY'
  }));
  graph.memberStages = memberStageProjection(input.members, graph, analysis);
  return graph;
}

function choose(values, fallback) {
  const selected = values.find((value) => value !== undefined && value !== null && value !== '');
  return selected === undefined ? fallback : selected;
}

function nodesFromMembers(members) {
  return (Array.isArray(members) ? members : []).flatMap((member) => memberWorkNodes(member));
}

function memberWorkNodes(member) {
  return responsibilities(member).map((responsibility, index) => buildWorkNode({ member, responsibility, index }));
}

function responsibilities(member) {
  if (member.ownedResponsibilities?.length) return member.ownedResponsibilities;
  return [choose([member.domain, member.subSystem, member.label, member.role], 'work')];
}

function buildWorkNode({ member, responsibility, index }) {
  return {
    nodeId: nodeIdFor(member, index),
    memberId: memberKey(member),
    domain: choose([member.domain, member.subSystem, member.label], null),
    responsibility,
    requiredCapabilities: strings(choose([member.expertise, member.capabilities], [])),
    inputs: strings(choose([member.inputArtifacts, member.consumes], [])),
    outputs: strings(choose([member.provides, member.outputs], [])),
    preconditions: strings(member.preconditions),
    postconditions: strings(member.postconditions),
    ownerAgentId: choose([member.agentId, member.workerId], null),
    risk: choose([member.risk], 'low'),
    criticality: choose([member.criticality], 'medium'),
    estimatedDuration: member.estimatedDuration,
    status: 'READY'
  };
}

function nodeIdFor(member, index) {
  return `work:${memberKey(member)}:${index}`;
}

function memberKey(member) {
  return member.memberId || member.agentId || member.workerId || member.domain || member.subSystem || member.label || member.role || 'member';
}

function edgesFromMembers(members, nodes) {
  const list = Array.isArray(members) ? members : [];
  const taskNodes = nodes || nodesFromMembers(list);
  const nodesByMember = groupNodesByMember(taskNodes);
  const memberIndex = indexMembers(list);
  const edges = [];
  for (const consumer of list) {
    for (const dependency of dependencies(consumer)) {
      const producer = memberIndex.get(dependency);
      if (!producer) throw unknownDependency(dependency, consumer);
      appendMemberEdges({ edges, nodesByMember, producer, consumer });
    }
  }
  return edges;
}

function groupNodesByMember(nodes) {
  const grouped = new Map();
  for (const node of nodes) {
    if (!grouped.has(node.memberId)) grouped.set(node.memberId, []);
    grouped.get(node.memberId).push(node.nodeId);
  }
  return grouped;
}

function indexMembers(members) {
  const index = new Map();
  for (const member of members) {
    for (const key of [member.memberId, member.agentId, member.workerId, member.domain, member.subSystem, member.label, member.role]) {
      if (key) index.set(key, member);
    }
  }
  return index;
}

function dependencies(member) {
  return strings(member.dependsOn || member.dependencyDomains);
}

function appendMemberEdges({ edges, nodesByMember, producer, consumer }) {
  const fromIds = nodesByMember.get(memberKey(producer));
  const toIds = nodesByMember.get(memberKey(consumer));
  if (!fromIds?.length || !toIds?.length) throw Object.assign(new Error('A-Team dependency has no work node.'), { code: 'ATEAM_WORK_GRAPH_NODE_MISSING' });
  for (const fromNode of fromIds) {
    for (const toNode of toIds) edges.push({ fromNode, toNode, contractType: 'DEPENDENCY', blocking: true });
  }
}

function memberStageProjection(members, graph, analysis) {
  const projection = {};
  for (const member of Array.isArray(members) ? members : []) {
    const key = memberKey(member);
    const ids = graph.nodes.filter((node) => node.memberId === key).map((node) => node.nodeId);
    projection[key] = Math.max(0, ...ids.map((id) => analysis.nodeStages[id]));
  }
  return projection;
}

function strings(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim());
}

function unknownDependency(dependency, consumer) {
  return Object.assign(new Error(`Unknown A-Team work dependency '${dependency}' for '${consumer.domain || consumer.subSystem || consumer.label || consumer.role}'.`), { code: 'ATEAM_WORK_GRAPH_UNKNOWN_DEPENDENCY' });
}

function assertValid(graph) {
  const validation = validateWorkGraph(graph);
  if (validation.valid) return;
  throw Object.assign(new Error(validation.errors.join(' ')), { code: 'ATEAM_WORK_GRAPH_INVALID', errors: validation.errors });
}

module.exports = { compileWorkGraph, assertValid };
