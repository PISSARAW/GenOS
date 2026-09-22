'use strict';

const EIGHT_DIMENSIONS = Object.freeze([
  'token', 'genomic', 'lineage', 'phenotypic',
  'mission', 'memory', 'causal', 'functional',
]);

function requireAgentPair(a, b) {
  if (!a || !b) throw new Error('forkIdentityService.compare requires two agents');
}

function compare(a, b) {
  requireAgentPair(a, b);
  return {
    comparedAt: Date.now(),
    dimensions: {
      token: { value: a.id === b.id ? 'identical' : 'distinct', sameAgentId: a.id === b.id },
      genomic: genomicSimilarity(a, b),
      lineage: lineageRelationBetween(a, b),
      phenotypic: phenotypicSimilarityOf(a, b),
      mission: missionContinuityBetween(a, b),
      memory: memoryContinuityBetween(a, b),
      causal: causalContinuityBetween(a, b),
      functional: functionalEquivalenceOf(a, b),
    },
    note: 'Eight identity dimensions assessed independently. No global identity verdict is emitted.',
    executable: false,
    runtimeAuthority: false,
  };
}

function genomicSimilarity(a, b) {
  if (!a.genome || !b.genome) return { value: 'unknown', sharedGenome: false, note: 'One or both agents have no genome reference.' };
  const sameStructure = a.genome.structureHash === b.genome.structureHash;
  const sharedLineage = lineageId(a) === lineageId(b);
  return { value: sameStructure && sharedLineage ? 'equivalent' : 'distinct', sharedGenome: sameStructure, sameLineage: sharedLineage, note: sameStructure ? 'Both agents share the same genome structure hash.' : 'Genome structures differ.' };
}

function lineageId(agent) {
  if (!agent || !agent.genome) return null;
  return agent.genome.lineageId || agent.genome.id;
}

function lineageRelationBetween(a, b) {
  const aLineage = lineageId(a);
  const bLineage = lineageId(b);
  if (!aLineage || !bLineage) return { value: 'unknown', relation: 'unknown', note: 'Lineage cannot be determined for one or both agents.' };
  if (aLineage === bLineage) return { value: 'same', relation: 'same', note: 'Both agents descend from the same lineage.' };
  const aParent = parentLineageId(a);
  const bParent = parentLineageId(b);
  if (aParent && bParent && aParent === bParent) return { value: 'sibling', relation: 'sibling', note: 'Both agents share a common parent lineage.' };
  if (aParent === bLineage) return { value: 'parent-child', relation: 'b-is-parent-of-a', note: 'Agent B is a direct ancestor of Agent A.' };
  if (bParent === aLineage) return { value: 'parent-child', relation: 'a-is-parent-of-b', note: 'Agent A is a direct ancestor of Agent B.' };
  return { value: 'unrelated', relation: 'unrelated', note: 'No direct lineage relationship detected.' };
}

function parentLineageId(agent) {
  if (!agent || !agent.genome || !agent.genome.parents) return null;
  const parents = Array.isArray(agent.genome.parents) ? agent.genome.parents : [agent.genome.parents];
  const found = parents.find(p => p && p.lineageId);
  return found ? found.lineageId : null;
}

function phenotypicSimilarityOf(a, b) {
  if (!a.phenotype || !b.phenotype) return { value: 'unknown', note: 'One or both agents have no phenotype record.' };
  const capabilitiesA = new Set(Array.isArray(a.phenotype.capabilities) ? a.phenotype.capabilities : []);
  const capabilitiesB = new Set(Array.isArray(b.phenotype.capabilities) ? b.phenotype.capabilities : []);
  const shared = [...capabilitiesA].filter(c => capabilitiesB.has(c));
  const onlyA = [...capabilitiesA].filter(c => !capabilitiesB.has(c));
  const onlyB = [...capabilitiesB].filter(c => !capabilitiesA.has(c));
  const totalSize = capabilitiesA.size + capabilitiesB.size;
  const similarityRatio = totalSize > 0 ? (2 * shared.length) / totalSize : 1;
  return {
    value: {
      sharedCapabilities: shared,
      onlyInA: onlyA,
      onlyInB: onlyB,
      similarityRatio: Math.round(similarityRatio * 1000) / 1000,
    },
    note: `Phenotypes share ${shared.length} capability(ies); A has ${onlyA.length} unique, B has ${onlyB.length} unique.`,
  };
}

function missionContinuityBetween(a, b) {
  if (!a.mission || !b.mission) return { value: 'unknown', sharedMission: false, note: 'One or both agents have no mission context.' };
  const sameMission = (a.mission.id || a.mission) === (b.mission.id || b.mission);
  return { value: sameMission ? 'continuous' : 'distinct', sameMission, missionA: a.mission, missionB: b.mission, note: sameMission ? 'Both agents target the same mission context.' : 'Mission contexts differ.' };
}

function memoryContinuityBetween(a, b) {
  const memA = Array.isArray(a.memory) ? a.memory : [];
  const memB = Array.isArray(b.memory) ? b.memory : [];
  if (memA.length === 0 && memB.length === 0) return { value: 'empty', sharedTraces: 0, note: 'Neither agent has recorded memory traces.' };
  return buildMemoryReportFromSequences(memA, memB);
}

function buildMemoryReportFromSequences(memA, memB) {
  const idsA = memA.map(m => m.id || m);
  const idsB = memB.map(m => m.id || m);
  const sharedLength = countSharedPrefix(idsA, idsB);
  const sharedCount = new Set(idsA.slice(0, sharedLength)).size;
  const forkEvent = findForkEvent(idsA, idsB, sharedLength);
  return buildMemoryReport(forkEvent, sharedCount, idsA.length, idsB.length);
}

function findForkEvent(idsA, idsB, sharedLength) {
  if (sharedLength < idsA.length || sharedLength < idsB.length) return idsA[sharedLength] ?? idsB[sharedLength] ?? null;
  return null;
}

function buildMemoryReport(forkedAt, sharedCount) {
  return {
    value: forkedAt ? 'forked' : (sharedCount > 0 ? 'continuous' : 'distinct'),
    sharedTraces: sharedCount,
    forkEvent: forkedAt || null,
    note: forkedAt ? `Memory traces diverge at event ${forkedAt}.` : (sharedCount > 0 ? `Shared memory traces: ${sharedCount}.` : 'No shared memory traces detected.'),
  };
}

function causalContinuityBetween(a, b) {
  const causalA = Array.isArray(a.causalChain) ? a.causalChain : [];
  const causalB = Array.isArray(b.causalChain) ? b.causalChain : [];
  if (causalA.length === 0 && causalB.length === 0) return { value: 'unknown', sharedUntil: null, note: 'No causal chain recorded for either agent.' };
  const sharedLength = countSharedPrefix(causalA, causalB);
  const sharedUntil = sharedLength > 0 ? causalA[sharedLength - 1] : null;
  return buildCausalReport({ sharedUntil, sharedLength, totals: [causalA.length, causalB.length] });
}

function countSharedPrefix(chainA, chainB) {
  let i = 0;
  while (i < chainA.length && i < chainB.length && chainA[i] === chainB[i]) i++;
  return i;
}

function buildCausalReport({ sharedUntil, sharedLength, totals }) {
  if (!sharedUntil) return { value: 'divergent', sharedUntil: null, sharedLength: 0, totalA: totals[0], totalB: totals[1], note: 'Causal chains diverge immediately.' };
  if (sharedLength === totals[0] && sharedLength === totals[1]) return { value: 'continuous', sharedUntil, sharedLength, totalA: totals[0], totalB: totals[1], note: 'Causal chains are fully shared.' };
  return { value: 'shared-until', sharedUntil, sharedLength, totalA: totals[0], totalB: totals[1], note: `Causal chains share ${sharedLength} event(s) until ${sharedUntil}.` };
}

function functionalEquivalenceOf(a, b) {
  if (!a.role || !b.role) return { value: 'unknown', sameRole: false, note: 'One or both agents have no role designation.' };
  const sameRole = a.role === b.role;
  const sameFunction = (a.function || a.role) === (b.function || b.role);
  return { value: sameRole && sameFunction ? 'equivalent' : 'distinct', sameRole, sameFunction, roleA: a.role, roleB: b.role, note: sameRole ? 'Both agents occupy the same role.' : 'Roles differ; functional equivalence cannot be assumed.' };
}

module.exports = {
  EIGHT_DIMENSIONS,
  compare,
  genomicSimilarity,
  lineageRelationBetween,
  phenotypicSimilarityOf,
  missionContinuityBetween,
  memoryContinuityBetween,
  causalContinuityBetween,
  functionalEquivalenceOf,
};
