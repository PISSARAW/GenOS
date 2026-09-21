'use strict';

const crypto = require('crypto');

const GENOME_FIELDS = new Set([
  'objective',
  'invariants',
  'completionContract',
  'safetyConstraints'
]);

const PHENOTYPE_FIELDS = new Set([
  'currentPlan',
  'activeExecution',
  'currentState'
]);

function genomeId() {
  return `genome_${crypto.randomUUID()}`;
}

function buildGenome(input = {}) {
  return {
    id: genomeId(),
    objective: input.objective || null,
    invariants: input.invariants || [],
    completionContract: input.completionContract || null,
    safetyConstraints: input.safetyConstraints || [],
    assembledAt: new Date().toISOString()
  };
}

function phenotypeId() {
  return `phenotype_${crypto.randomUUID()}`;
}

function buildPhenotype(input = {}) {
  return {
    id: phenotypeId(),
    currentPlan: input.currentPlan || null,
    activeExecution: input.activeExecution || null,
    currentState: input.currentState || null,
    expressedAt: new Date().toISOString()
  };
}

function tissueKinds() {
  return new Set(['workers', 'orchestrator', 'verifiers', 'recoveryCells']);
}

function tissueEntry(input) {
  const kind = input.kind;
  if (!tissueKinds().has(kind)) throw new Error(`Unknown tissue kind '${kind}'.`);
  return { kind, identifier: input.identifier, role: input.role || null, status: input.status || 'alive', since: new Date().toISOString() };
}

function buildTissues(input = {}) {
  const raw = Array.isArray(input) ? input : (input.tissues || []);
  const tissues = { workers: [], orchestrator: [], verifiers: [], recoveryCells: [] };
  for (const entry of raw) {
    const normalized = tissueEntry({
      kind: entry.kind,
      identifier: entry.identifier,
      role: entry.role,
      status: entry.status
    });
    (tissues[entry.kind] || []).push(normalized);
  }
  return tissues;
}

function metabolismSnapshot(input = {}) {
  return {
    tokens: Number(input.tokens || 0),
    cost: Number(input.cost || 0),
    latencyMs: Number(input.latencyMs || 0),
    computeCycles: Number(input.computeCycles || 0),
    sampledAt: new Date().toISOString()
  };
}

function immuneEvidenceGate(kind, predicate, status) {
  return { kind, predicate: predicate || null, status: status || 'armed', since: new Date().toISOString() };
}

function buildImmuneSystem(input = {}) {
  return {
    evidenceGates: (input.evidenceGates || []).map(g => immuneEvidenceGate(g.kind, g.predicate, g.status)),
    tests: (input.tests || []).map(t => ({ id: t.id, status: t.status || 'pending', since: new Date().toISOString() })),
    anomalyDetection: input.anomalyDetection || null,
    quarantine: input.quarantine || null,
    assembledAt: new Date().toISOString()
  };
}

function nervousSignal(input) {
  const kind = input.kind;
  return { kind, payload: input.payload || {}, origin: input.origin || null, at: new Date().toISOString() };
}

function buildNervousSystem(input = {}) {
  return {
    telemetry: input.telemetry || null,
    heartbeats: (input.heartbeats || []).map(h => nervousSignal({ kind: 'heartbeat', payload: h })),
    signals: (input.signals || []).map(s => nervousSignal({ kind: s.kind, payload: s.payload, origin: s.origin })),
    assembledAt: new Date().toISOString()
  };
}

function checkpointRecord(input = {}) {
  return {
    id: input.id || `ckpt_${crypto.randomUUID()}`,
    at: input.at || new Date().toISOString(),
    state: input.state || null,
    injury: input.injury || null,
    repair: input.repair || null,
    outcome: input.outcome || null,
    successful: input.successful !== null ? Boolean(input.successful) : null
  };
}

function scarRecord(input = {}) {
  return {
    id: input.id || `scar_${crypto.randomUUID()}`,
    injury: input.injury || null,
    repair: input.repair || null,
    stateBefore: input.stateBefore || null,
    stateAfter: input.stateAfter || null,
    successful: input.successful !== null ? Boolean(input.successful) : null,
    recordedAt: new Date().toISOString()
  };
}

function failedStrategyRecord(input = {}) {
  return {
    id: input.id || `failed_${crypto.randomUUID()}`,
    failureCategory: input.failureCategory || null,
    strategy: input.strategy || null,
    signature: input.signature || null,
    prohibitedExactRetry: input.prohibitedExactRetry !== false,
    preferredResponse: input.preferredResponse || null,
    recordedAt: new Date().toISOString()
  };
}

function buildMemorySystem(input = {}) {
  return {
    checkpoints: (input.checkpoints || []).map(c => checkpointRecord(c)),
    scars: (input.scars || []).map(s => scarRecord(s)),
    failedStrategies: (input.failedStrategies || []).map(f => failedStrategyRecord(f)),
    provenance: input.provenance || [],
    assembledAt: new Date().toISOString()
  };
}

function buildSurvivalSystem(input = {}) {
  return {
    regeneration: input.regeneration || null,
    quiescence: input.quiescence || null,
    cryptobiosis: input.cryptobiosis || null,
    apoptosis: input.apoptosis || null,
    assembledAt: new Date().toISOString()
  };
}

function validateGenome(genome) {
  const errors = [];
  if (!genome || typeof genome !== 'object') errors.push('genome must be an object');
  else {
    if (!genome.objective && genome.invariants.length === 0) errors.push('genome requires objective or invariants');
  }
  return errors;
}

function validatePhenotype(phenotype) {
  const errors = [];
  if (!phenotype || typeof phenotype !== 'object') errors.push('phenotype must be an object');
  return errors;
}

function newOrganism(input = {}) {
  const genome = buildGenome(input.genome);
  if (validateGenome(genome).length) throw new Error('Invalid genome for new organism');
  return {
    id: input.id || `organism_${crypto.randomUUID()}`,
    genome,
    phenotype: buildPhenotype(input.phenotype),
    tissues: buildTissues(input.tissues),
    metabolism: metabolismSnapshot(input.metabolism),
    immuneSystem: buildImmuneSystem(input.immuneSystem),
    nervousSystem: buildNervousSystem(input.nervousSystem),
    memory: buildMemorySystem(input.memory),
    survival: buildSurvivalSystem(input.survival),
    assembledAt: new Date().toISOString()
  };
}

function expressPhenotype(organism, input = {}) {
  const updated = Object.assign({}, organism, {
    phenotype: buildPhenotype({
      currentPlan: input.currentPlan !== undefined ? input.currentPlan : organism.phenotype.currentPlan,
      activeExecution: input.activeExecution !== undefined ? input.activeExecution : organism.phenotype.activeExecution,
      currentState: input.currentState !== undefined ? input.currentState : organism.phenotype.currentState
    })
  });
  return updated;
}

function recordCheckpoint(organism, input = {}) {
  const checkpoint = checkpointRecord(input);
  return Object.assign({}, organism, {
    memory: Object.assign({}, organism.memory, {
      checkpoints: [...organism.memory.checkpoints, checkpoint]
    })
  });
}

function recordScar(organism, input = {}) {
  const scar = scarRecord(input);
  return Object.assign({}, organism, {
    memory: Object.assign({}, organism.memory, {
      scars: [...organism.memory.scars, scar]
    })
  });
}

function recordFailedStrategy(organism, input = {}) {
  const failed = failedStrategyRecord(input);
  return Object.assign({}, organism, {
    memory: Object.assign({}, organism.memory, {
      failedStrategies: [...organism.memory.failedStrategies, failed]
    })
  });
}

function updateMetabolism(organism, input = {}) {
  return Object.assign({}, organism, {
    metabolism: metabolismSnapshot(Object.assign({}, organism.metabolism, input))
  });
}

function addSignal(organism, signal) {
  const normalized = nervousSignal({ kind: signal.kind, payload: signal.payload, origin: signal.origin });
  return Object.assign({}, organism, {
    nervousSystem: Object.assign({}, organism.nervousSystem, {
      signals: [...organism.nervousSystem.signals, normalized]
    })
  });
}

function tissueStatus(organism, kind, identifier) {
  const list = organism.tissues[kind];
  if (!list) return null;
  return (list.find(t => t.identifier === identifier) || {}).status;
}

function isFunctionCovered(organism, requiredRoles) {
  const covered = new Set();
  for (const tissue of Object.values(organism.tissues)) {
    for (const cell of (Array.isArray(tissue) ? tissue : [])) {
      if (cell.status === 'alive' && cell.role) covered.add(cell.role);
    }
  }
  return requiredRoles.every(role => covered.has(role));
}

module.exports = {
  genomeId,
  phenotypeId,
  buildGenome,
  buildPhenotype,
  buildTissues,
  metabolismSnapshot,
  buildImmuneSystem,
  buildNervousSystem,
  buildMemorySystem,
  buildSurvivalSystem,
  newOrganism,
  expressPhenotype,
  recordCheckpoint,
  recordScar,
  recordFailedStrategy,
  updateMetabolism,
  addSignal,
  tissueStatus,
  isFunctionCovered,
  validateGenome,
  validatePhenotype,
  GENOME_FIELDS,
  PHENOTYPE_FIELDS
};
