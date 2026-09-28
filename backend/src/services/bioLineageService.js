'use strict';

const SCHEMA_VERSION = '1.0.0';
const STAGES = [
  'Naissance',
  'Differenciation',
  'Activite',
  'Dormance',
  'Senescence',
  'Apoptose',
  'Recuperation',
];
const ALLOWED = {
  Naissance: ['Differenciation', 'Activite'],
  Differenciation: ['Activite', 'Dormance'],
  Activite: ['Dormance', 'Senescence', 'Apoptose'],
  Dormance: ['Activite', 'Recuperation', 'Apoptose'],
  Senescence: ['Apoptose', 'Recuperation'],
  Recuperation: ['Activite', 'Dormance'],
  Apoptose: [],
};

function newLifecycle(cellId) {
  return { cell_id: cellId, stage: 'Naissance', schema_version: SCHEMA_VERSION };
}

function transition(lifecycle, next) {
  const options = ALLOWED[lifecycle.stage] || [];
  if (!options.includes(next)) {
    throw failure(`transition interdite ${lifecycle.stage} -> ${next}`);
  }
  return { ...lifecycle, stage: next };
}

function failure(message) {
  const err = new Error(message);
  err.code = 'BIO_LIFECYCLE_REJECTED';
  return err;
}

function linkCellGenome(cellId, genomeId, phenotypeHash) {
  return { cell_id: cellId, genome_id: genomeId, phenotype_hash: phenotypeHash, schema_version: SCHEMA_VERSION };
}

function toManifest(link, lineageId) {
  if (!link.phenotype_hash) {
    throw failure('phenotype manquant');
  }
  return { cell_id: link.cell_id, genome_id: link.genome_id, phenotype_hash: link.phenotype_hash, lineage_id: lineageId, schema_version: SCHEMA_VERSION };
}

module.exports = {
  SCHEMA_VERSION,
  STAGES,
  newLifecycle,
  transition,
  linkCellGenome,
  toManifest,
};
