'use strict';

const ALLOCATION_PATTERN_1 = /\b(?:plafond|capacit[eé])\s+(?:de\s+)?(\d+)\b|\bd[eé]pass(?:e|er)\s+(?:un\s+)?(?:total\s+)?(?:de\s+)?(\d+)\b|\bexceed\s+(?:a\s+)?(?:total\s+)?(?:of\s+)?(\d+)\b|\babove\s+(\d+)\b/i;
const ALLOCATION_PATTERN_2 = /\b(?:plafond|capacit[eé])\s+(?:de\s+)?\d+\b|\bd[eé]pass(?:e|er)\s+(?:un\s+)?(?:total\s+)?(?:de\s+)?\d+\b|\bexceed\s+(?:a\s+)?(?:total\s+)?(?:of\s+)?\d+\b/i;

function morphogenesisRoleInstruction(assignment) {
  const workerAssignment = assignment?.workerAssignment || assignment || {};
  const topology = String(workerAssignment.topology || assignment?.morphologyTopology || '').toLowerCase();
  const role = String(require('./morphogenesisRolePromptValues1.js').morphogenesisRoleInstructionValue15({ assignment, workerAssignment })).toLowerCase();
  if (topology !== 'biome') return null;
  if (role === 'environment_mapper') {
    return 'Morphogenesis role: Biome environment mapper. Observe the entities, values, units, and constraints stated in the mission. Return only evidence-grounded structured observations in the required scout_observation artifact; do not produce or claim the final solution.';
  }
  if (role === 'resource_steward') {
    return 'Morphogenesis role: Biome resource steward. This exact allocation task is within your assigned niche; arithmetic, exhaustive search, backtracking, and per-bin verification are within scope. All item identifiers, weights, capacities, group count, and the mission evidence reference are supplied; do not return unresolved for missing information, complexity, or method choice. The combined item total equals the combined capacity, so this is feasible in aggregate, not an impossibility. Solve the allocation task. Put a JSON object beginning with { and containing the key "bins" in the GenOS evidence claim statement, not at the report root or as a bare array. Use exact item identifiers (item1, item2, etc.) as quoted JSON strings ("item1"), never bare tokens, weights, or indices. Verify every item appears exactly once and all capacities before claiming success.';
  }
  return null;
}

function morphogenesisUseMemoryContext(assignment) {
  const workerAssignment = assignment?.workerAssignment || assignment || {};
  const topology = String(workerAssignment.topology || assignment?.morphologyTopology || '').toLowerCase();
  const role = String(workerAssignment.topologyRole || assignment?.topologyRole || assignment?.role || '').toLowerCase();
  return topology !== 'biome' || !['environment_mapper', 'resource_steward'].includes(role);
}

function morphogenesisCompactWorkerRole(assignment) {
  const workerAssignment = assignment?.workerAssignment || assignment || {};
  const topology = String(workerAssignment.topology || assignment?.morphologyTopology || '').toLowerCase();
  const role = String(workerAssignment.topologyRole || assignment?.topologyRole || assignment?.role || '').toLowerCase();
  return topology === 'biome' && role === 'resource_steward';
}

function allocationFacts(source) {
  const items = [...source.matchAll(/\b(item\d+)\s*=\s*(-?\d+)\b/gi)]
    .map((match) => ({ id: match[1], value: Number(match[2]) }));
  const groups = Number(require('./morphogenesisRolePromptValues1.js').allocationFactsValue8({ source }));
  const capacityMatch = source.match(ALLOCATION_PATTERN_1);
  const capacity = Number(require('./morphogenesisRolePromptValues1.js').allocationFactsValue6({ capacityMatch, source }));
  return { items, groups, capacity };
}

function validateBiomeAllocation(candidate, mission, assignment) {
  const workerAssignment = require('./morphogenesisRolePromptValues1.js').validateBiomeAllocationValue7({ assignment });
  const topology = String(require('./morphogenesisRolePromptValues1.js').validateBiomeAllocationValue10({ assignment, workerAssignment })).toLowerCase();
  const role = String(require('./morphogenesisRolePromptValues1.js').validateBiomeAllocationValue5({ assignment, workerAssignment })).toLowerCase();
  if (require('./morphogenesisRolePromptValues1.js').validateBiomeAllocationValue11({ role, topology })) return null;
  const source = String(mission || '').slice(0, 8192);
  const facts = allocationFacts(source);
  if (require('./morphogenesisRolePromptValues1.js').validateBiomeAllocationValue9({ facts })) return null;
  let value = candidate;
  { const __genosStageResult8 = require('./morphogenesisRolePromptStages1.js').validateBiomeAllocationStage8({ JSON, get value() { return value; }, set value(__genosNextStageValue) { value = __genosNextStageValue; } }); if (__genosStageResult8) return __genosStageResult8.value; }
  const bins = value && value.bins;
  { const __genosStageResult6 = require('./morphogenesisRolePromptStages1.js').validateBiomeAllocationStage6({ Array, bins, facts }); if (__genosStageResult6) return __genosStageResult6.value; }
  const weights = new Map(facts.items.map(({ id, value: weight }) => [id, weight]));
  const seen = [];
  const issues = [];
  bins.forEach((bin, index) => {
    { const __genosStageResult7 = require('./morphogenesisRolePromptStages1.js').validateBiomeAllocationStage7({ Array, bin, index, issues }); if (__genosStageResult7) return __genosStageResult7.value; }
    let sum = 0;
    require('./morphogenesisRolePromptStages1.js').validateBiomeAllocationStage9({ String, bin, issues, seen, get sum() { return sum; }, set sum(__genosNextStageValue) { sum = __genosNextStageValue; }, weights });
    if (sum > facts.capacity) issues.push(`candidate.bin_${index + 1}_over_capacity:${sum}`);
  });
  const expected = facts.items.map(({ id }) => id).sort();
  if (JSON.stringify(seen.sort()) !== JSON.stringify(expected)) issues.push('candidate.item_coverage');
  return { passed: issues.length === 0, issues };
}

function morphogenesisWorkerAssignments(assignments, topology, mission) {
  const mapperIndex = require('./morphogenesisRolePromptValues1.js').morphogenesisWorkerAssignmentsValue2({ Array, String, assignments });
  const current = require('./morphogenesisRolePromptValues1.js').morphogenesisWorkerAssignmentsValue1({ Array, assignments, mapperIndex });
  const assignedTopology = current.topology || current.workerAssignment?.topology;
  if (String(require('./morphogenesisRolePromptValues1.js').morphogenesisWorkerAssignmentsValue3({ assignedTopology, topology })).toLowerCase() !== 'biome') return assignments;
  { const __genosStageResult1 = require('./morphogenesisRolePromptStages1.js').morphogenesisWorkerAssignmentsStage1({ Array, assignments, mapperIndex }); if (__genosStageResult1) return __genosStageResult1.value; }
  const methodId = String(current.methodContract?.methodId || '').toLowerCase();
  { const __genosStageResult2 = require('./morphogenesisRolePromptStages1.js').morphogenesisWorkerAssignmentsStage2({ assignments, current, methodId }); if (__genosStageResult2) return __genosStageResult2.value; }
  const source = String(mission || '').slice(0, 8192);
  const facts = allocationFacts(source);
  if (require('./morphogenesisRolePromptValues1.js').morphogenesisWorkerAssignmentsValue4({ facts })) return assignments;
  const terms = facts.items.map(({ id, value }) => `${id}=${value}`);
  const groupTerm = source.match(/\b\d+\s+groupes?\b/i)?.[0];
  const capacityTerm = source.match(ALLOCATION_PATTERN_2)?.[0];
  require('./morphogenesisRolePromptStages1.js').morphogenesisWorkerAssignmentsStage4({ groupTerm, terms });
  require('./morphogenesisRolePromptStages1.js').morphogenesisWorkerAssignmentsStage5({ capacityTerm, terms });
  const mapper = { ...current, methodContract: {
    version: 1, methodId: 'scan_literal', parameters: {
      sources: [{ sourceRef: 'mission', text: source }], terms: terms.slice(0, 20)
    }
  } };
  { const __genosStageResult3 = require('./morphogenesisRolePromptStages1.js').morphogenesisWorkerAssignmentsStage3({ Array, assignments, mapper, mapperIndex }); if (__genosStageResult3) return __genosStageResult3.value; }
  return { ...assignments, environment_mapper: mapper };
}

function bindBiomeMapperAssignment(assignment, mission) {
  const workerAssignment = require('./morphogenesisRolePromptValues1.js').bindBiomeMapperAssignmentValue14({ assignment });
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
  const workerAssignment = require('./morphogenesisRolePromptValues1.js').morphogenesisMissionPromptValue13({ assignment });
  const topology = String(workerAssignment.topology || assignment?.morphologyTopology || '').toLowerCase();
  const role = String(require('./morphogenesisRolePromptValues1.js').morphogenesisMissionPromptValue12({ assignment, workerAssignment })).toLowerCase();
  if (topology !== 'biome' || !['environment_mapper', 'resource_steward'].includes(role)) return mission;
  const source = String(mission || '').replace(/\nRéponds au schéma de preuve GenOS complet:[\s\S]*$/i, '');
  const facts = allocationFacts(source);
  if (require('./morphogenesisRolePromptValues1.js').morphogenesisMissionPromptValue16({ facts })) return mission;
  const itemList = facts.items.map(({ id, value }) => `${id}=${value}`).join(',');
  const summary = `items=${itemList};count=${facts.items.length};groups=${facts.groups};max=${facts.capacity}`;
  if (role === 'environment_mapper') {
    return `Observe only: ${summary}. These are all requested facts; copy every item and value verbatim into one observation. Do not solve or reorganize them; they are sufficient, so do not return unresolved. Return JSON {"observations":[{"observation":"${itemList}","sourceRefs":["mission"],"confidence":1,"uncertainties":[]} ]}.`;
  }
  const total = facts.items.reduce((sum, item) => sum + item.value, 0);
  const exactTotal = total === facts.groups * facts.capacity
    ? ` Total=${total} equals combined capacity=${facts.groups * facts.capacity}; this is feasible in aggregate, not impossible. Each bin has its own limit ${facts.capacity} and must total exactly ${facts.capacity}.`
    : ` Total=${total}; combined capacity=${facts.groups}*${facts.capacity}=${facts.groups * facts.capacity}; each bin has its own limit ${facts.capacity} and must total at most that amount.`;
  const repair = require('./morphogenesis/biomeAllocationFeedback').recoveryInstruction(source);
  return `${summary}. Partition into ${facts.groups} non-empty bins. Use each item once; totals must stay at or below ${facts.capacity}.${exactTotal} Search weights descending with backtracking; place only if they fit, skip bins with equal capacity, and backtrack on dead ends. Recalculate each bin. Claim impossibility only after exhaustive search.${repair} Return one GenOS dossier with exactly one claim: claims[0].statement is a JSON object beginning with { and containing exactly the key "bins"; its value is an array of exactly ${facts.groups} arrays. Every inner value is an array of quoted exact item IDs, never a string. Evidence contains "mission". No prose, bare array, nested dossier, duplicate claim, or repeated schema.`;
}

module.exports = { morphogenesisRoleInstruction, morphogenesisMissionPrompt, morphogenesisUseMemoryContext,
  morphogenesisCompactWorkerRole,
  morphogenesisWorkerAssignments, bindBiomeMapperAssignment, validateBiomeAllocation };
