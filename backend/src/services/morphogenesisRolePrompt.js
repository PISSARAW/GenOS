'use strict';

function morphogenesisRoleInstruction(assignment) {
  const workerAssignment = assignment?.workerAssignment || assignment || {};
  const topology = String(workerAssignment.topology || assignment?.morphologyTopology || '').toLowerCase();
  const role = String(workerAssignment.topologyRole || assignment?.topologyRole || assignment?.role || '').toLowerCase();
  if (topology !== 'biome') return null;
  if (role === 'environment_mapper') {
    return 'Morphogenesis role: Biome environment mapper. Observe the entities, values, units, and constraints stated in the mission. Return only evidence-grounded structured observations in the required scout_observation artifact; do not produce or claim the final solution.';
  }
  if (role === 'resource_steward') {
    return 'Morphogenesis role: Biome resource steward. Solve the assigned allocation task. Put the complete candidate JSON in the GenOS evidence claim statement, not at the report root. Use exact item identifiers (item1, item2, etc.), never weights or indices. Verify every item appears exactly once and all capacities before claiming success.';
  }
  return null;
}

function morphogenesisUseMemoryContext(assignment) {
  const workerAssignment = assignment?.workerAssignment || assignment || {};
  const topology = String(workerAssignment.topology || assignment?.morphologyTopology || '').toLowerCase();
  const role = String(workerAssignment.topologyRole || assignment?.topologyRole || assignment?.role || '').toLowerCase();
  return topology !== 'biome' || role !== 'environment_mapper';
}

function allocationFacts(source) {
  const items = [...source.matchAll(/\b(item\d+)\s*=\s*(-?\d+)\b/gi)]
    .map((match) => ({ id: match[1], value: Number(match[2]) }));
  const groups = Number(source.match(/\b(\d+)\s+groupes?\b/i)?.[1]);
  const capacityMatch = source.match(/\b(?:plafond|capacit[eé])\s+(?:de\s+)?(\d+)\b|\bd[eé]pass(?:e|er)\s+(?:un\s+)?(?:total\s+)?(?:de\s+)?(\d+)\b|\bexceed\s+(?:a\s+)?(?:total\s+)?(?:of\s+)?(\d+)\b/i);
  const capacity = Number(capacityMatch?.[1] || capacityMatch?.[2] || capacityMatch?.[3]);
  return { items, groups, capacity };
}

function morphogenesisWorkerAssignments(assignments, topology, mission) {
  const mapperIndex = Array.isArray(assignments)
    ? assignments.findIndex((item) => String(item?.topologyRole || item?.role || '').toLowerCase() === 'environment_mapper')
    : -1;
  const current = Array.isArray(assignments)
    ? assignments[mapperIndex] || {}
    : assignments?.environment_mapper || {};
  const assignedTopology = current.topology || current.workerAssignment?.topology;
  if (String(assignedTopology || topology || '').toLowerCase() !== 'biome') return assignments;
  if (Array.isArray(assignments) && mapperIndex < 0) return assignments;
  const methodId = String(current.methodContract?.methodId || '').toLowerCase();
  if (current.methodContract && methodId !== 'prompt_defined') return assignments;
  const source = String(mission || '').slice(0, 8192);
  const facts = allocationFacts(source);
  if (!facts.items.length || !facts.groups || !facts.capacity) return assignments;
  const terms = facts.items.map(({ id, value }) => `${id}=${value}`);
  const groupTerm = source.match(/\b\d+\s+groupes?\b/i)?.[0];
  const capacityTerm = source.match(/\b(?:plafond|capacit[eé])\s+(?:de\s+)?\d+\b|\bd[eé]pass(?:e|er)\s+(?:un\s+)?(?:total\s+)?(?:de\s+)?\d+\b|\bexceed\s+(?:a\s+)?(?:total\s+)?(?:of\s+)?\d+\b/i)?.[0];
  if (groupTerm) terms.push(groupTerm);
  if (capacityTerm) terms.push(capacityTerm);
  const mapper = { ...current, methodContract: {
    version: 1, methodId: 'scan_literal', parameters: {
      sources: [{ sourceRef: 'mission', text: source }], terms: terms.slice(0, 20)
    }
  } };
  if (Array.isArray(assignments)) return assignments.map((item, index) => index === mapperIndex ? mapper : item);
  return { ...assignments, environment_mapper: mapper };
}

function bindBiomeMapperAssignment(assignment, mission) {
  const workerAssignment = assignment?.workerAssignment || assignment || {};
  const role = String(assignment?.role || workerAssignment.topologyRole || '').toLowerCase();
  const topology = workerAssignment.topology || assignment?.morphologyTopology || 'biome';
  if (role !== 'environment_mapper' || String(topology).toLowerCase() !== 'biome') return assignment;
  const mapped = morphogenesisWorkerAssignments({ environment_mapper: {
    ...workerAssignment, methodContract: workerAssignment.methodContract || assignment.methodContract
  } }, 'biome', mission)?.environment_mapper;
  if (!mapped?.methodContract || mapped.methodContract.methodId === workerAssignment.methodContract?.methodId) return assignment;
  return { ...assignment, methodContract: mapped.methodContract,
    workerAssignment: { ...workerAssignment, methodContract: mapped.methodContract } };
}

function morphogenesisMissionPrompt(assignment, mission) {
  const workerAssignment = assignment?.workerAssignment || assignment || {};
  const topology = String(workerAssignment.topology || assignment?.morphologyTopology || '').toLowerCase();
  const role = String(workerAssignment.topologyRole || assignment?.topologyRole || assignment?.role || '').toLowerCase();
  if (topology !== 'biome' || !['environment_mapper', 'resource_steward'].includes(role)) return mission;
  const source = String(mission || '').replace(/\nRéponds au schéma de preuve GenOS complet:[\s\S]*$/i, '');
  const facts = allocationFacts(source);
  if (!facts.items.length || !facts.groups || !facts.capacity) return mission;
  const itemList = facts.items.map(({ id, value }) => `${id}=${value}`).join(',');
  const summary = `items=${itemList};count=${facts.items.length};groups=${facts.groups};max=${facts.capacity}`;
  if (role === 'environment_mapper') {
    return `Observe only: ${summary}. These are all requested facts; copy every item and value verbatim into one observation. Do not solve or reorganize them; they are sufficient, so do not return unresolved. Return JSON {"observations":[{"observation":"${itemList}","sourceRefs":["mission"],"confidence":1,"uncertainties":[]} ]}.`;
  }
  const total = facts.items.reduce((sum, item) => sum + item.value, 0);
  const exactTotal = total === facts.groups * facts.capacity
    ? ` The total weight is ${total}, so every bin must sum to exactly ${facts.capacity}.` : '';
  const candidateShape = JSON.stringify({ bins: Array.from({ length: facts.groups }, () => ['<item-id>']) });
  const itemWeights = facts.items.map(({ id, value }) => `${id}=${value}`).join(', ');
  return `Solve this allocation. Item weights: ${itemWeights}. Create exactly ${facts.groups} bins. Put each named item in exactly one bin; no bin may have a total weight above ${facts.capacity}.${exactTotal} Use largest-first search with backtracking: place a high-weight item where it fits, track remaining capacity, and undo/retry a placement whenever a later item cannot fit. Do not stop at a greedy dead end. Required candidate shape (bins are arrays of exact item identifiers, never weights): ${candidateShape}. Before returning, check that all ${facts.items.length} distinct identifiers occur once and recalculate each bin total. If either check fails, revise the assignment; if you cannot find a valid assignment, return unresolved rather than success. Return a complete GenOS dossier: {"outcome":"success","claims":[{"statement":"<candidate JSON object>","evidence":["mission"]}],"specialtyAssessment":{"niche":"biome:resource_steward","inScope":true,"evidence":["mission"]}}. Put only the compact candidate JSON object in claims[0].statement; do not put bins at the report root or replace the candidate with prose.`;
}

module.exports = { morphogenesisRoleInstruction, morphogenesisMissionPrompt, morphogenesisUseMemoryContext,
  morphogenesisWorkerAssignments, bindBiomeMapperAssignment };
