/**
 * Biomimicry Handler: Sesquizygotic Twins (Jumeaux Semi-Identiques)
 *
 * Simulates dispermic fertilization (1 maternal foundation base + 2 paternal heuristic vectors)
 * resolving into twin agents sharing 100% maternal invariants and 50% paternal traits (75% overall similarity).
 */

const crypto = require('crypto');

// In-memory registry of sesquizygotic pairs
const SESQUIZYGOTIC_REGISTRY = new Map();

function hashPayload(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload || {})).digest('hex').substring(0, 16);
}

function handleDispermicSplit(args) {
  const maternalBase = args.maternal_base || { system_prompt: 'STANDARD_INVARIANTS', model_family: 'gemini_core' };
  const paternalVectorA = args.paternal_vector_a || { specialization: 'rust_opt', tools: ['cargo_check'] };
  const paternalVectorB = args.paternal_vector_b || { specialization: 'security_audit', tools: ['audit_tracer'] };

  const pairId = `sesqui_pair_${Date.now()}`;
  const matHash = hashPayload(maternalBase);
  const patAHash = hashPayload(paternalVectorA);
  const patBHash = hashPayload(paternalVectorB);

  // Twin 1 gets 100% Maternal + Paternal A (primary) blended with 50% Paternal B traits
  const twin1 = {
    agentId: `sesqui_twin_1_${Math.random().toString(36).substring(2, 7)}`,
    maternalBase,
    primaryPaternal: paternalVectorA,
    chimericPaternalRatio: 0.5,
    epigeneticBlend: {
      activeTools: Array.from(new Set([...(paternalVectorA.tools || []), (paternalVectorB.tools || [])[0]].filter(Boolean))),
      consensusOrientation: 0.75
    }
  };

  // Twin 2 gets 100% Maternal + Paternal B (primary) blended with 50% Paternal A traits
  const twin2 = {
    agentId: `sesqui_twin_2_${Math.random().toString(36).substring(2, 7)}`,
    maternalBase,
    primaryPaternal: paternalVectorB,
    chimericPaternalRatio: 0.5,
    epigeneticBlend: {
      activeTools: Array.from(new Set([...(paternalVectorB.tools || []), (paternalVectorA.tools || [])[0]].filter(Boolean))),
      consensusOrientation: 0.75
    }
  };

  const record = {
    pairId,
    maternalHash: matHash,
    paternalHashes: [patAHash, patBHash],
    overallGeneticOverlap: 0.75,
    twins: [twin1, twin2],
    createdAt: new Date().toISOString()
  };

  SESQUIZYGOTIC_REGISTRY.set(pairId, record);

  return {
    configured: true,
    success: true,
    status: 'dispermic_split_complete',
    pair_id: pairId,
    maternal_identity_ratio: 1.0,
    paternal_identity_ratio: 0.5,
    composite_identity_ratio: 0.75,
    twin_1: twin1,
    twin_2: twin2,
    output: `Sesquizygotic twins [${twin1.agentId}] and [${twin2.agentId}] generated (75% composite genomic identity).`
  };
}

function handleInspect(args) {
  const pairId = args.pair_id;
  const record = SESQUIZYGOTIC_REGISTRY.get(pairId);

  if (!record) {
    return {
      configured: true,
      success: false,
      status: 'not_found',
      error: `Sesquizygotic pair [${pairId}] not found.`
    };
  }

  return {
    configured: true,
    success: true,
    status: 'inspected',
    pair_id: pairId,
    maternal_hash: record.maternalHash,
    overall_overlap: record.overallGeneticOverlap,
    twins: record.twins.map(t => ({
      agentId: t.agentId,
      toolsCount: t.epigeneticBlend.activeTools.length,
      consensus: t.epigeneticBlend.consensusOrientation
    }))
  };
}

function handleStatus(args) {
  const pairId = args.pair_id;
  if (pairId) {
    return handleInspect(args);
  }

  const allPairs = Array.from(SESQUIZYGOTIC_REGISTRY.values()).map(r => ({
    pairId: r.pairId,
    overlap: r.overallGeneticOverlap,
    twinCount: r.twins.length
  }));

  return {
    configured: true,
    success: true,
    total_pairs: allPairs.length,
    pairs: allPairs
  };
}

async function handle(args, run) {
  const action = (args && args.action) || 'status';

  switch (action) {
    case 'dispermic_fertilization_and_split':
      return handleDispermicSplit(args);
    case 'inspect_genetic_overlap':
      return handleInspect(args);
    case 'status':
    default:
      return handleStatus(args);
  }
}

module.exports = {
  handle,
  SESQUIZYGOTIC_REGISTRY
};
