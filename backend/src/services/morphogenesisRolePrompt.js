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
    return 'Morphogenesis role: Biome resource steward. Produce the mission candidate. Use exact item identifiers (item1, item2, etc.), never weights or indices. For allocation tasks, calculate each group total, verify every item appears exactly once, and check all capacities before claiming success.';
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
  const capacity = Number(source.match(/\b(?:plafond|capacit[eé])\s+(?:de\s+)?(\d+)\b/i)?.[1]);
  return { items, groups, capacity };
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
    ? ` Total=${total}; each group must sum exactly ${facts.capacity}.` : '';
  const largest = Math.max(...facts.items.map((item) => item.value));
  const fitHint = exactTotal && largest > 0 && largest <= facts.capacity
    ? ` Place the largest value ${largest} first and reserve a complement of ${facts.capacity - largest}; backtrack rather than omit any item.` : '';
  return `Partition ${summary}. Use all ${facts.items.length} items exactly once; no group may exceed ${facts.capacity}.${exactTotal}${fitHint} Return only JSON {"bins":[["item1"],...]}; verify item count and each total before answering.`;
}

module.exports = { morphogenesisRoleInstruction, morphogenesisMissionPrompt, morphogenesisUseMemoryContext };
