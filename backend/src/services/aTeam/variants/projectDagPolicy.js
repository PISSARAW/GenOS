'use strict';

const { validateSchema } = require('./variantExecutionService');

function projectDagPolicy(mission, members) {
  const nodes = Array.isArray(mission.dagNodes) ? mission.dagNodes.map((node) => ({ ...node, dependencies: [...(node.dependencies || [])] })) : members.map((m, i) => ({
    nodeId: `node_${i + 1}`,
    memberId: memberId(m),
    name: defaultTo(m.nodeName, `Node ${i + 1}`),
    inputSchema: defaultTo(m.inputSchema, { type: 'object' }),
    outputSchema: defaultTo(m.outputSchema, { type: 'object' }),
    dependencies: defaultTo(m.dependencies, defaultTo(m.dependsOn, [])),
    duration: defaultTo(m.estimatedDuration, 1),
    resources: defaultTo(m.resources, {})
  }));
  normalizeDependencies(nodes, members, Boolean(mission.dagNodes));

  validateNodeContracts(nodes);

  const edges = buildEdges(nodes);
  validateDag(nodes, edges);

  const timing = analyzeTimings(nodes, edges);
  const criticalPath = timing.criticalPath;
  const resourceLimits = defaultTo(mission.resourceLimits, {});
  const resourceSchedule = scheduleResources(nodes, edges, resourceLimits);
  const fanInOut = analyzeFanInOut(nodes, edges);

  return {
    dagNodes: nodes,
    dagEdges: edges,
    executionModel: {
      type: 'dependency_driven',
      criticalPathScheduler: {
        enabled: true,
        path: criticalPath,
        slack: timing.slack
      },
      resourceScheduling: {
        enabled: true,
        schedule: resourceSchedule,
        conflicts: detectResourceConflicts(resourceSchedule, resourceLimits)
      },
      typedFanInOut: fanInOut,
      conditionalJoins: buildConditionalJoins(nodes, edges, defaultTo(mission.joinConditions, {})),
      incrementalInvalidation: {
        enabled: true,
        strategy: 'minimal_recalculation',
        affectedNodesDetector: 'transitive_closure',
        recomputeOnlyDirty: true,
        invalidatedNodes: affectedNodes(defaultTo(mission.changedNodeIds, []), edges)
      }
    },
    validation: {
      contractValidationPerNode: true,
      evidenceRequiredPerNode: true,
      crossValidationOnJoins: true
    }
  };
}

function defaultTo(value, fallback) {
  return value || fallback;
}

function validateNodeContracts(nodes) {
  for (const node of nodes) {
    const errors = [...validateSchema(node.inputSchema), ...validateSchema(node.outputSchema)];
    if (errors.length) throw coded(`DAG node '${node.nodeId}' contract is invalid: ${errors.join(' ')}`, 'ATEAM_DAG_SCHEMA_INVALID');
  }
}

function normalizeDependencies(nodes, members, supplied) {
  const nodeForMember = new Map(nodes.map((node) => [node.memberId, node.nodeId]));
  const nodeForDomain = new Map(members.map((member, index) => [member.domain || member.subSystem || member.label || member.role, nodes[index]?.nodeId]));
  for (const node of nodes) {
    if (!Array.isArray(node.dependencies)) node.dependencies = [];
    if (!supplied) node.dependencies = node.dependencies.map((dependency) => nodeForMember.get(dependency) || nodeForDomain.get(dependency) || dependency);
  }
}

function analyzeTimings(nodes, edges) {
  const ordered = topologicalSort(nodes, edges);
  const entries = new Map(nodes.map((node) => [node.nodeId, { duration: Math.max(1, Number(node.duration) || 1), earliestStart: 0, earliestFinish: 0, latestStart: 0, latestFinish: 0 }]));
  for (const id of ordered) {
    const item = entries.get(id);
    item.earliestStart = Math.max(0, ...edges.filter((edge) => edge.to === id).map((edge) => entries.get(edge.from).earliestFinish));
    item.earliestFinish = item.earliestStart + item.duration;
  }
  const end = Math.max(...[...entries.values()].map((item) => item.earliestFinish));
  for (const id of [...ordered].reverse()) {
    const item = entries.get(id);
    const nextStarts = edges.filter((edge) => edge.from === id).map((edge) => entries.get(edge.to).latestStart);
    item.latestFinish = nextStarts.length ? Math.min(...nextStarts) : end;
    item.latestStart = item.latestFinish - item.duration;
  }
  const slack = Object.fromEntries([...entries].map(([id, item]) => [id, item.latestStart - item.earliestStart]));
  return { slack, criticalPath: ordered.filter((id) => slack[id] < 0.001) };
}

function affectedNodes(changedNodeIds, edges) {
  const affected = new Set(changedNodeIds);
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const edge of edges) {
      if (affected.has(edge.from) && !affected.has(edge.to)) {
        affected.add(edge.to);
        expanded = true;
      }
    }
  }
  return [...affected];
}

function validateDag(nodes, edges) {
  const visited = new Set();
  const visiting = new Set();

  function visit(nodeId) {
    if (visiting.has(nodeId)) throw coded(`Cycle detected at node ${nodeId}`, 'ATEAM_DAG_CYCLE');
    if (visited.has(nodeId)) return;
    visiting.add(nodeId);
    for (const edge of edges.filter((e) => e.from === nodeId)) visit(edge.to);
    visiting.delete(nodeId);
    visited.add(nodeId);
  }

  for (const node of nodes) visit(node.nodeId);

  const nodeIds = new Set(nodes.map((n) => n.nodeId));
  for (const edge of edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      throw coded(`Edge references unknown node: ${edge.from} -> ${edge.to}`, 'ATEAM_DAG_UNKNOWN_NODE');
    }
  }
}

function buildEdges(nodes) {
  const edges = [];
  for (const node of nodes) {
    for (const dep of node.dependencies) {
      edges.push({ from: dep, to: node.nodeId, type: 'data_dependency' });
    }
  }
  return edges;
}

function topologicalSort(nodes, edges) {
  const inDegree = new Map(nodes.map((n) => [n.nodeId, 0]));
  const adj = new Map(nodes.map((n) => [n.nodeId, []]));
  for (const edge of edges) {
    inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
    adj.get(edge.from).push(edge.to);
  }
  const queue = [...inDegree.entries()].filter(([, d]) => d === 0).map(([id]) => id);
  const result = [];
  while (queue.length) {
    const u = queue.shift();
    result.push(u);
    for (const v of adj.get(u)) {
      const d = inDegree.get(v) - 1;
      inDegree.set(v, d);
      if (d === 0) queue.push(v);
    }
  }
  if (result.length !== nodes.length) throw coded('DAG has cycle', 'ATEAM_DAG_CYCLE');
  return result;
}

function scheduleResources(nodes, edges, limits) {
  const topo = topologicalSort(nodes, edges);
  const schedule = [];
  for (const nodeId of topo) {
    const node = nodes.find((n) => n.nodeId === nodeId);
    const resources = node.resources || {};
    const duration = Math.max(1, Number(node.duration) || 1);
    assertResourceDemand(resources, limits, nodeId);
    const earliest = calculateEarliestStart(nodeId, edges, schedule);
    const startTime = resourceStart({ resources, duration, earliest, schedule, limits });
    schedule.push({ nodeId, startTime, finishTime: startTime + duration, duration, resources, memberId: node.memberId });
  }
  return schedule;
}

function assertResourceDemand(resources, limits, nodeId) {
  for (const [name, amount] of Object.entries(resources)) {
    if (!Number.isFinite(amount) || amount < 0 || (limits[name] && amount > limits[name])) {
      throw coded(`DAG node '${nodeId}' exceeds resource capacity '${name}'.`, 'ATEAM_DAG_RESOURCE_DEMAND_INVALID');
    }
  }
}

function resourceStart(context) {
  let start = context.earliest;
  while (!resourcesAvailable({ ...context, start })) start = nextResourceRelease(context.schedule, start);
  return start;
}

function resourcesAvailable({ resources, duration, start, schedule, limits }) {
  const checkpoints = new Set([start, ...schedule.map((item) => item.startTime).filter((time) => time >= start && time < start + duration)]);
  for (const time of checkpoints) {
    for (const [name, amount] of Object.entries(resources)) {
      const used = schedule.filter((item) => item.startTime <= time && item.finishTime > time)
        .reduce((sum, item) => sum + (item.resources[name] || 0), amount);
      if (limits[name] && used > limits[name]) return false;
    }
  }
  return true;
}

function nextResourceRelease(schedule, current) {
  const releases = schedule.map((item) => item.finishTime).filter((time) => time > current);
  if (!releases.length) throw coded('DAG resource schedule cannot find an available slot.', 'ATEAM_DAG_RESOURCE_DEADLOCK');
  return Math.min(...releases);
}

function calculateEarliestStart(nodeId, edges, schedule) {
  const preds = edges.filter((e) => e.to === nodeId).map((e) => e.from);
  if (preds.length === 0) return 0;
  return Math.max(...preds.map((p) => {
    const s = schedule.find((x) => x.nodeId === p);
    return s ? s.finishTime : 0;
  }));
}

function detectResourceConflicts(schedule, limits) {
  const conflicts = [];
  const byResource = {};
  for (const item of schedule) {
    for (const [resource, amount] of Object.entries(item.resources)) {
      if (!byResource[resource]) byResource[resource] = [];
      byResource[resource].push(item);
    }
  }
  for (const [resource, items] of Object.entries(byResource)) conflicts.push(...resourceConflicts(resource, items, limits[resource]));
  return conflicts;
}

function resourceConflicts(resource, items, limit) {
  if (!Number.isFinite(limit)) return [];
  const conflicts = [];
  for (const item of items) {
    const active = items.filter((candidate) => candidate.startTime <= item.startTime && candidate.finishTime > item.startTime);
    const amount = active.reduce((sum, candidate) => sum + Number(candidate.resources[resource] || 0), 0);
    if (amount > limit) conflicts.push({ resource, at: item.startTime, items: active.map((candidate) => candidate.nodeId) });
  }
  return conflicts;
}

function analyzeFanInOut(nodes, edges) {
  const result = {};
  for (const node of nodes) {
    const fanIn = edges.filter((e) => e.to === node.nodeId).length;
    const fanOut = edges.filter((e) => e.from === node.nodeId).length;
    result[node.nodeId] = { fanIn, fanOut, typed: true };
  }
  return result;
}

function buildConditionalJoins(nodes, edges, conditions) {
  const joins = [];
  for (const node of nodes) {
    const preds = edges.filter((e) => e.to === node.nodeId);
    if (preds.length > 1) {
      const configured = conditions[node.nodeId] || 'ALL';
      const condition = typeof configured === 'string' ? { type: configured } : configured;
      if (!['ALL', 'ANY', 'N_OF'].includes(condition.type)) throw coded(`DAG join '${node.nodeId}' has an invalid condition.`, 'ATEAM_DAG_JOIN_INVALID');
      joins.push({ nodeId: node.nodeId, type: condition.type, count: condition.count, predecessors: preds.map((p) => p.from) });
    }
  }
  return joins;
}

function buildVariantPolicyForTeam(team, mission) {
  return {
    variant: team.variant,
    minMembers: team.minMembers || 2,
    customPolicy: team.customPolicy || {}
  };
}

function buildIntegrationCouncil(teamConfigs, mission) {
  return {
    members: teamConfigs.map((t) => t.teamId),
    chair: mission.councilChair || teamConfigs[0]?.teamId,
    cadence: mission.councilCadence || 600000,
    authority: mission.councilAuthority || 'advisory',
    decisions: []
  };
}

function buildInterTeamContracts(teamConfigs, mission) {
  const contracts = [];
  for (let i = 0; i < teamConfigs.length; i++) {
    for (let j = i + 1; j < teamConfigs.length; j++) {
      const contract = mission.contracts?.[`${teamConfigs[i].teamId}-${teamConfigs[j].teamId}`];
      if (contract) {
        contracts.push({
          from: teamConfigs[i].teamId,
          to: teamConfigs[j].teamId,
          ...contract,
          validated: false
        });
      }
    }
  }
  return contracts;
}

function identifyBoundarySpanners(teamConfigs, mission) {
  return (mission.boundarySpanners || []).map((spanner) => ({
    ...spanner,
    fromTeam: spanner.fromTeam,
    toTeam: spanner.toTeam,
    translationSchema: spanner.translationSchema || {}
  }));
}

function allocateLocalBudgets(teamConfigs, globalBudget, strategy) {
  const budgets = {};
  const totalWeight = teamConfigs.reduce((sum, t) => sum + (t.weight || 1), 0);

  for (const team of teamConfigs) {
    const weight = team.weight || 1;
    const ratio = strategy === 'proportional' ? weight / totalWeight : 1 / teamConfigs.length;
    budgets[team.teamId] = {
      tokens: Math.floor((globalBudget.tokens || 0) * ratio),
      compute: Math.floor((globalBudget.compute || 0) * ratio),
      time: Math.floor((globalBudget.time || 0) * ratio)
    };
  }
  return budgets;
}


function memberId(member = {}) { return member.memberId || member.agentId || member.workerId || member.domain || member.subSystem || member.label || member.role || null; }
function coded(message, code) { return Object.assign(new Error(message), { code }); }
module.exports = { projectDagPolicy };
