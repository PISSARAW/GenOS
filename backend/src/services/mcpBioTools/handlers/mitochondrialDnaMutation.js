// Registry for Mitochondrial DNA (mtDNA) & Matrilineal Inheritance
const mtdnaRegistry = new Map();

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
  const stress = Math.max(0.1, Math.min(5.0, stressLevel || 1.0));
  const newMutations = Math.ceil(stress * 2);
  record.oxidativeStressMutations += newMutations;
  
  // Degrade or adapt energy efficiency
  const penalty = newMutations * 0.04;
  record.tokenEnergyEfficiency = Math.max(0.2, Number((record.tokenEnergyEfficiency - penalty).toFixed(2)));
  record.updatedAt = new Date().toISOString();

  return {
    configured: true,
    success: true,
    status: 'mtdna_mutated_under_stress',
    transport: 'mtdna_engine',
    mtdna_id: mtdnaId,
    stress_applied: stress,
    new_mutations: newMutations,
    total_mutations: record.oxidativeStressMutations,
    token_energy_efficiency: record.tokenEnergyEfficiency,
    output: `mtDNA accumulated ${newMutations} oxidative stress mutations. Energy efficiency now: ${record.tokenEnergyEfficiency}.`
  };
}

function handleTransmitMaternalLineage(record, mtdnaId, args) {
  const childId = args.child_id || `child-${Date.now()}`;
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
    paternal_mtdna_purged: true,
    output: `Child '${childId}' strictly inherited maternal haplogroup '${childRecord.maternalHaplogroup}'. Paternal mtDNA purged.`
  };
}

function handleMitochondrialDnaMutation(args = {}) {
  const action = args.action || 'status';
  const mtdnaId = args.id || `mtdna-${Date.now()}`;
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

module.exports = {
  handleMitochondrialDnaMutation,
  handleMitochondrialDnaMutationError,
  mtdnaRegistry
};
