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

function validateBiomeAllocation(candidate, mission, assignment) {
  const workerAssignment = assignment?.workerAssignment || assignment || {};
  const topology = String(workerAssignment.topology || assignment?.morphologyTopology || '').toLowerCase();
  const role = String(workerAssignment.topologyRole || assignment?.topologyRole || assignment?.role || '').toLowerCase();
  if (topology !== 'biome' || role !== 'resource_steward') return null;
  const source = String(mission || '').slice(0, 8192);
  const facts = allocationFacts(source);
  if (!facts.items.length || !facts.groups || !facts.capacity) return null;
  let value = candidate;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); }
    catch (_) { return { passed: false, issues: ['candidate.invalid_json'] }; }
  }
  const bins = value && value.bins;
  if (!Array.isArray(bins) || bins.length !== facts.groups) {
    return { passed: false, issues: ['candidate.bin_count'] };
  }
  const weights = new Map(facts.items.map(({ id, value: weight }) => [id, weight]));
  const seen = [];
  const issues = [];
  bins.forEach((bin, index) => {
    if (!Array.isArray(bin) || bin.length === 0) {
      issues.push(`candidate.bin_${index + 1}_empty_or_invalid`);
      return;
    }
    let sum = 0;
    for (const rawId of bin) {
      const id = String(rawId);
      if (!weights.has(id)) {
        issues.push(`candidate.unknown_item:${id}`);
        continue;
      }
      sum += weights.get(id);
      seen.push(id);
    }
    if (sum > facts.capacity) issues.push(`candidate.bin_${index + 1}_over_capacity:${sum}`);
  });
  const expected = facts.items.map(({ id }) => id).sort();
  if (JSON.stringify(seen.sort()) !== JSON.stringify(expected)) issues.push('candidate.item_coverage');
  return { passed: issues.length === 0, issues };
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
    ? ` First check feasibility: total weight=${total}; aggregate capacity=${facts.groups}*${facts.capacity}=${facts.groups * facts.capacity}. Capacity is sufficient and exact, so every bin must sum to exactly ${facts.capacity}. Do not report insufficient capacity when these totals match. This proves feasibility only; you must still construct and verify the assignment.`
    : ` First check feasibility: total weight=${total}; aggregate capacity=${facts.groups}*${facts.capacity}=${facts.groups * facts.capacity}. Total weight is below aggregate capacity, so bins do not need to be full; each bin only needs a sum at or below ${facts.capacity}.`;
  const candidateShape = JSON.stringify({ bins: Array.from({ length: facts.groups }, () => ['<item-id>']) });
  const itemWeights = facts.items.map(({ id, value }) => `${id}=${value}`).join(', ');
  return `Solve this small allocation. Item weights: ${itemWeights}. Create exactly ${facts.groups} non-empty bins. Put each named item in exactly one bin; no bin may have a total weight above ${facts.capacity}.${exactTotal} For search, order items by descending weight (break ties by item identifier). Place each next item in a bin only when its running subtotal plus that weight is at most ${facts.capacity}; if no bin fits, backtrack and move an earlier item. Continue until every item is assigned. Check that leftover weight always fits in the remaining bins. When aggregate capacity is exact, every bin must finish at exactly ${facts.capacity}; otherwise bins may be below capacity. The budget is sufficient for this ${facts.items.length}-item arithmetic task; do not abstain because you think it needs exhaustive search. Required candidate shape (bins are arrays of exact item identifiers, never weights): ${candidateShape}. Before returning, check that all ${facts.items.length} distinct identifiers occur once and recalculate each bin total. If any bin exceeds ${facts.capacity}, is empty, or misses the exact target when required, revise the assignment; return unresolved only if no valid assignment exists after backtracking. Return exactly one GenOS dossier using the worker schema already provided. It must contain exactly one claim. Put only the compact candidate JSON object in claims[0].statement; do not repeat the schema, add another claim or nested dossier, put bins at the report root, or replace the candidate with prose.`;
}

module.exports = { morphogenesisRoleInstruction, morphogenesisMissionPrompt, morphogenesisUseMemoryContext,
  morphogenesisWorkerAssignments, bindBiomeMapperAssignment, validateBiomeAllocation };
