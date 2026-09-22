'use strict';

/**
 * Fork Identity Service — huit dimensions d'identité pour comparer deux agents
 * ou deux instantanés d'un même processus.
 *
 * Mapping philosophique (Constitution GenOS, § IV) :
 *  - Token identity        : identité numérique (même identifiant dans le temps)
 *  - Genomic identity      : héritage de génome/lineage partagé
 *  - Lineage identity      : relation de descendance (parent → enfant → descendant)
 *  - Phenotypic identity   : capacités et état actuels
 *  - Mission identity      : but ou contexte de tâche partagé
 *  - Memory continuity     : continuité de l'historique des traces
 *  - Causal continuity     : chaîne ininterrompue d'influences causales
 *  - Functional identity   : même rôle/fonction dans le système
 *
 * invariant : aucun verdict global d'identité n'est émis. Le service retourne
 * huit dimensions indépendantes ; c'est le contexte qui tranche.
 */

const EIGHT_DIMENSIONS = Object.freeze([
  'token',
  'genomic',
  'lineage',
  'phenotypic',
  'mission',
  'memory',
  'causal',
  'functional',
]);

function requireAgentPair(a, b) {
  if (!a || !b) {
    throw new Error('forkIdentityService.compare requires two agents');
  }
}

/**
 * compare — compare deux agents selon les huit dimensions de l'identité.
 *
 * Retourne un objet structuré avec les huit dimensions évaluées et une
 * explicitation du contexte. Aucun verdict global n'est produit.
 */
function compare(a, b) {
  requireAgentPair(a, b);

  const tokenIdem = a.id === b.id;
  const genomicIdem = genomicSimilarity(a, b);
  const lineageRelation = lineageRelationBetween(a, b);
  const phenotypicSimilarity = phenotypicSimilarityOf(a, b);
  const missionContinuity = missionContinuityBetween(a, b);
  const memoryContinuity = memoryContinuityBetween(a, b);
  const causalContinuity = causalContinuityBetween(a, b);
  const functionalEquivalence = functionalEquivalenceOf(a, b);

  return {
    comparedAt: Date.now(),
    dimensions: {
      token: {
        value: tokenIdem ? 'identical' : 'distinct',
        sameAgentId: tokenIdem,
      },
      genomic: genomicIdem,
      lineage: lineageRelation,
      phenotypic: phenotypicSimilarity,
      mission: missionContinuity,
      memory: memoryContinuity,
      causal: causalContinuity,
      functional: functionalEquivalence,
    },
    note: 'Eight identity dimensions assessed independently. No global identity verdict is emitted.',
    executable: false,
    runtimeAuthority: false,
  };
}

/**
 * genomicSimilarity — similarité génomique entre deux agents.
 *
 * Deux agents partagent-ils le même génome ou un héritage de génome identifiable ?
 */
function genomicSimilarity(a, b) {
  if (!a.genome || !b.genome) {
    return { value: 'unknown', sharedGenome: false, note: 'One or both agents have no genome reference.' };
  }
  const sameStructure = a.genome.structureHash === b.genome.structureHash;
  const sharedLineage = lineageId(a) === lineageId(b);
  return {
    value: sameStructure && sharedLineage ? 'equivalent' : 'distinct',
    sharedGenome: sameStructure,
    sameLineage: sharedLineage,
    note: sameStructure
      ? 'Both agents share the same genome structure hash.'
      : 'Genome structures differ.',
  };
}

function lineageId(agent) {
  if (!agent || !agent.genome) return null;
  return agent.genome.lineageId || agent.genome.id;
}

/**
 * lineageRelation — relation de lignée entre deux agents.
 *
 * Retourne la relation : same | parent-child | sibling | cousin | unrelated
 */
function lineageRelationBetween(a, b) {
  const aLineage = lineageId(a);
  const bLineage = lineageId(b);
  if (!aLineage || !bLineage) {
    return { value: 'unknown', relation: 'unknown', note: 'Lineage cannot be determined for one or both agents.' };
  }
  if (aLineage === bLineage) {
    return { value: 'same', relation: 'same', note: 'Both agents descend from the same lineage.' };
  }
  const aParent = parentLineageId(a);
  const bParent = parentLineageId(b);
  if (aParent && bParent && aParent === bParent) {
    return { value: 'sibling', relation: 'sibling', note: 'Both agents share a common parent lineage.' };
  }
  if (aParent === bLineage) {
    return { value: 'parent-child', relation: 'a-is-parent-of-b', note: 'Agent A is a direct ancestor of Agent B.' };
  }
  if (bParent === aLineage) {
    return { value: 'parent-child', relation: 'b-is-parent-of-a', note: 'Agent B is a direct ancestor of Agent A.' };
  }
  return { value: 'unrelated', relation: 'unrelated', note: 'No direct lineage relationship detected.' };
}

function parentLineageId(agent) {
  if (!agent || !agent.genome || !agent.genome.parents) return null;
  const parents = Array.isArray(agent.genome.parents) ? agent.genome.parents : [agent.genome.parents];
  return parents.find(p => p && p.lineageId) ? parents.find(p => p && p.lineageId).lineageId : null;
}

/**
 * phenotypicSimilarity — similarité phénotypique.
 *
 * Retourne une note descriptive avec les dimensions comparées. Pas de score unique.
 */
function phenotypicSimilarityOf(a, b) {
  if (!a.phenotype || !b.phenotype) {
    return { value: 'unknown', note: 'One or both agents have no phenotype record.' };
  }
  const capabilitiesA = new Set(Array.isArray(a.phenotype.capabilities) ? a.phenotype.capabilities : []);
  const capabilitiesB = new Set(Array.isArray(b.phenotype.capabilities) ? b.phenotype.capabilities : []);
  const shared = [...capabilitiesA].filter(c => capabilitiesB.has(c));
  const onlyA = [...capabilitiesA].filter(c => !capabilitiesB.has(c));
  const onlyB = [...capabilitiesB].filter(c => !capabilitiesA.has(c));
  const similarityRatio = capabilitiesA.size + capabilitiesB.size > 0
    ? shared.length / (capabilitiesA.size + capabilitiesB.size)
    : 1;
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

/**
 * missionContinuity — continuité de mission.
 */
function missionContinuityBetween(a, b) {
  if (!a.mission || !b.mission) {
    return { value: 'unknown', sharedMission: false, note: 'One or both agents have no mission context.' };
  }
  const sameMission = (a.mission.id || a.mission) === (b.mission.id || b.mission);
  return {
    value: sameMission ? 'continuous' : 'distinct',
    sameMission,
    missionA: a.mission,
    missionB: b.mission,
    note: sameMission
      ? 'Both agents target the same mission context.'
      : 'Mission contexts differ.',
  };
}

/**
 * memoryContinuity — continuité de la mémoire (traces, historique).
 *
 * Retourne l'état de la continuité documentaire entre deux agents.
 */
function memoryContinuityBetween(a, b) {
  const memA = Array.isArray(a.memory) ? a.memory : [];
  const memB = Array.isArray(b.memory) ? b.memory : [];
  if (memA.length === 0 && memB.length === 0) {
    return { value: 'empty', sharedTraces: 0, note: 'Neither agent has recorded memory traces.' };
  }
  const setA = new Set(memA.map(m => m.id || m));
  const setB = new Set(memB.map(m => m.id || m));
  const shared = [...setA].filter(id => setB.has(id));
  const forkedAt = findForkPoint(memA, memB);
  return buildMemoryReport(forkedAt, shared.length);
}

function buildMemoryReport(forkedAt, sharedCount) {
  return {
    value: forkedAt ? 'forked' : (sharedCount > 0 ? 'continuous' : 'distinct'),
    sharedTraces: sharedCount,
    forkEvent: forkedAt || null,
    note: forkedAt
      ? `Memory traces diverge at event ${forkedAt}.`
      : (sharedCount > 0
        ? `Shared memory traces: ${sharedCount}.`
        : 'No shared memory traces detected.'),
  };
}

function findForkPoint(memA, memB) {
  const setB = new Set(memB.map(m => m.id || m));
  for (const m of memA) {
    if (!setB.has(m.id || m)) {
      return m.id || m;
    }
  }
  return null;
}

/**
 * causalContinuity — continuité causale.
 *
 * Retourne jusqu'où la chaîne causale est partagée entre deux agents.
 */
function causalContinuityBetween(a, b) {
  const causalA = Array.isArray(a.causalChain) ? a.causalChain : [];
  const causalB = Array.isArray(b.causalChain) ? b.causalChain : [];
  if (causalA.length === 0 && causalB.length === 0) {
    return { value: 'unknown', sharedUntil: null, note: 'No causal chain recorded for either agent.' };
  }
  const sharedLength = countSharedPrefix(causalA, causalB);
  const sharedUntil = sharedLength > 0 ? causalA[sharedLength - 1] : null;
  return buildCausalReport({ sharedUntil, sharedLength, totals: [causalA.length, causalB.length] });
}

function countSharedPrefix(chainA, chainB) {
  let i = 0;
  while (i < chainA.length && i < chainB.length && chainA[i] === chainB[i]) {
    i++;
  }
  return i;
}

function buildCausalReport({ sharedUntil, sharedLength, totals }) {
  return {
    value: sharedUntil ? 'shared-until' : (sharedLength === 0 ? 'divergent' : 'continuous'),
    sharedUntil,
    sharedLength,
    totalA: totals[0],
    totalB: totals[1],
    note: sharedUntil
      ? `Causal chains share ${sharedLength} event(s) until ${sharedUntil}.`
      : (sharedLength === 0
        ? 'Causal chains diverge immediately.'
        : 'Causal chains are fully shared.'),
  };
}

/**
 * functionalEquivalence — équivalence fonctionnelle.
 *
 * Deux agents remplissent-ils la même fonction dans le système ?
 */
function functionalEquivalenceOf(a, b) {
  if (!a.role || !b.role) {
    return { value: 'unknown', sameRole: false, note: 'One or both agents have no role designation.' };
  }
  const sameRole = a.role === b.role;
  const sameFunction = (a.function || a.role) === (b.function || b.role);
  return {
    value: sameRole && sameFunction ? 'equivalent' : 'distinct',
    sameRole,
    sameFunction,
    roleA: a.role,
    roleB: b.role,
    note: sameRole
      ? 'Both agents occupy the same role.'
      : 'Roles differ; functional equivalence cannot be assumed.',
  };
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
