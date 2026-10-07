// Registry for Mitochondrial DNA (mtDNA) & Matrilineal Inheritance
let mtdnaRegistry = new Map();

function getMtdnaRecord(id) {
  if (!mtdnaRegistry.has(id)) {
    mtdnaRegistry.set(id, {
      id,
      maternalHaplogroup: 'HAPLO_MATERNAL_ORIGIN_ALPHA',
      circularGenomeGenes: ['MT_ATP6', 'MT_CO1', 'MT_ND1', 'MT_CYB'],
      tokenEnergyEfficiency: 1.0, // 1.0 = 100% nominal ATP/token conversion
      oxidativeStressMutations: 0,
      generation: 1,
      updatedAt: new Date().toISOString()
    });
  }
  return mtdnaRegistry.get(id);
}

function handleStressMutation(record, mtdnaId, stressLevel) {
  const stress = stressLevel === undefined ? 1.0 : stressLevel;
  if (typeof stress !== 'number' || !Number.isFinite(stress) || stress < 0.1 || stress > 5.0) {
    return { configured: true, success: false, status: 'invalid_args', error: 'stress_level must be a finite number from 0.1 to 5.' };
  }
  const newMutations = Math.ceil(stress * 2);
  record.oxidativeStressMutations += newMutations;
  
  // Degrade or adapt energy efficiency
  const penalty = newMutations * 0.04;
  record.tokenEnergyEfficiency = Math.max(0.2, Number((record.tokenEnergyEfficiency - penalty).toFixed(2)));
  record.updatedAt = new Date().toISOString();

  return {
    configured: true,
    success: true,
    status: 'metadata_recorded',
    transport: 'mtdna_engine',
    mtdna_id: mtdnaId,
    stress_applied: stress,
    new_mutations: newMutations,
    total_mutations: record.oxidativeStressMutations,
    token_energy_efficiency: record.tokenEnergyEfficiency,
    execution_scope: 'metadata_simulation',
    runtime_genome_changed: false,
    output: `mtDNA accumulated ${newMutations} oxidative stress mutations. Energy efficiency now: ${record.tokenEnergyEfficiency}.`
  };
}

function handleTransmitMaternalLineage(record, mtdnaId, args) {
  const childId = args.child_id || `child-${Date.now()}`;
  if (typeof childId !== 'string' || !childId.trim() || childId.length > 120 || childId === mtdnaId) {
    return { configured: true, success: false, status: 'invalid_args', error: 'child_id must be distinct from the parent id and at most 120 characters.' };
  }
  const childRecord = {
    id: childId,
    maternalHaplogroup: record.maternalHaplogroup, // strictly maternal
    circularGenomeGenes: [...record.circularGenomeGenes],
    tokenEnergyEfficiency: record.tokenEnergyEfficiency,
    oxidativeStressMutations: record.oxidativeStressMutations,
    generation: record.generation + 1,
    paternalMtdnaPurged: true,
    updatedAt: new Date().toISOString()
  };
  mtdnaRegistry.set(childId, childRecord);

  return {
    configured: true,
    success: true,
    status: 'maternal_lineage_transmitted',
    transport: 'mtdna_engine',
    mother_id: mtdnaId,
    child_id: childId,
    maternal_haplogroup: childRecord.maternalHaplogroup,
    generation: childRecord.generation,
    paternal_mtdna_purged: false,
    execution_scope: 'metadata_simulation',
    runtime_genome_changed: false,
    output: `Recorded maternal-lineage metadata for '${childId}' with haplogroup '${childRecord.maternalHaplogroup}'. No runtime inheritance or purge occurred.`
  };
}

function handleMitochondrialDnaMutation(args = {}) {
  const action = args.action || 'status';
  const mtdnaId = args.id || `mtdna-${Date.now()}`;
  if (typeof mtdnaId !== 'string' || !mtdnaId.trim() || mtdnaId.length > 120) {
    return { configured: true, success: false, status: 'invalid_args', error: 'id must be a non-empty string of at most 120 characters.' };
  }
  if (handleMitochondrialDnaMutationCondition(action, args)) {
    return { configured: true, success: false, status: 'invalid_args', error: 'stress_level must be a finite number from 0.1 to 5.' };
  }
  const record = getMtdnaRecord(mtdnaId);

  if (action === 'mutate_mtdna_under_stress') {
    return handleStressMutation(record, mtdnaId, args.stress_level);
  }
  if (action === 'transmit_maternal_lineage') {
    return handleTransmitMaternalLineage(record, mtdnaId, args);
  }

  return {
    configured: true,
    success: true,
    status: 'active',
    transport: 'mtdna_engine',
    execution_scope: 'metadata_simulation',
    mtdna_id: mtdnaId,
    haplogroup: record.maternalHaplogroup,
    efficiency: record.tokenEnergyEfficiency,
    mutations_count: record.oxidativeStressMutations,
    generation: record.generation,
    output: `mtDNA engine '${mtdnaId}' active (Haplogroup: ${record.maternalHaplogroup}, Efficiency: ${record.tokenEnergyEfficiency}).`
  };
}

function handleMitochondrialDnaMutationError(e) {
  return {
    configured: true,
    success: false,
    status: 'tool_error',
    transport: 'mtdna_engine',
    output: e.message || 'Unknown mtDNA mutation error'
  };
}


// ── Persistance adaptive hors process ──────────────────────────────────────
let _mitochondrialRegistryPersistent = false;

function _ensuremitochondrialRegistryPersistent() {
  // require lazy pour éviter circularité
  const adaptivePersister = require('../../adaptiveStateBootstrap');
  if (_mitochondrialRegistryPersistent || !adaptivePersister || !adaptivePersister.getAdaptivePersister) return;
  try {
    const persister = adaptivePersister.getAdaptivePersister();
    if (!persister) return;
    // Réhydrate depuis DB
    const stored = persister.getMcpBiomimicryRegistry ? persister.getMcpBiomimicryRegistry('mcp_bio::mitochondrial_dna_mutation', 'mtdnaRegistry') : null;
    const mapToUse = stored && stored.size ? stored : mtdnaRegistry;
    const persistentMap = persister.makePersistentMap ? persister.makePersistentMap('mcp_bio::mitochondrial_dna_mutation', 'mtdnaRegistry', mapToUse) : mapToUse;
    mtdnaRegistry = persistentMap;
    // Remplacer la référence exportée par le proxy persistant
    Object.defineProperty(module.exports, 'mtdnaRegistry', {
      value: persistentMap,
      writable: true,
      configurable: true
    });
    _mitochondrialRegistryPersistent = true;
  } catch (_) { /* best-effort */ }
}

function setAdaptivePersister(persister) {
  const adaptivePersister = require('../../adaptiveStateBootstrap');
  adaptivePersister.setAdaptivePersister && adaptivePersister.setAdaptivePersister(persister);
  _ensuremitochondrialRegistryPersistent();
}

function getAdaptivePersister() {
  return require('../../adaptiveStateBootstrap');
}

function getSnapshot() {
  const map = module.exports.mtdnaRegistry || mtdnaRegistry;
  const obj = {};
  if (map instanceof Map) {
    for (const [k, v] of map.entries()) obj[k] = v;
  }
  return obj;
}

function onMutation(snapshot) {
  // La Map est déjà persistée par le proxy ; on ne fait rien de plus.
}

_ensuremitochondrialRegistryPersistent();

module.exports = {
  handleMitochondrialDnaMutation,
  handleMitochondrialDnaMutationError,
  mtdnaRegistry,
  setAdaptivePersister,
  getAdaptivePersister,
  getSnapshot,
  onMutation};

function handleMitochondrialDnaMutationCondition(action, args) {
  return action === 'mutate_mtdna_under_stress' && args.stress_level !== undefined &&
      (typeof args.stress_level !== 'number' || !Number.isFinite(args.stress_level) || args.stress_level < 0.1 || args.stress_level > 5);
}
