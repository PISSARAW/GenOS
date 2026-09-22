'use strict';

// Procedural runtime — the pipeline that connects the existing engines:
//
//   generateVariants -> immune inspection -> sealCandidate -> semantic
//   validation -> promotion gate -> persistGenome
//
// This service adds NO new biological mechanism (per the v1 freeze): it only
// wires the existing services into an executable lifecycle. Every step is a
// measurable gate; a candidate that fails any step is reported, not promoted.

const mutation = require('./proceduralMutationSelectionService');
const immune = require('./proceduralImmuneInspectionService');
const identity = require('./proceduralIdentityService');
const semantics = require('./proceduralGraphSemanticsService');
const gate = require('./proceduralPromotionGateService');
const persistence = require('./proceduralPersistenceService');

function inspectVariant(variant) {
  const report = immune.inspectMutation({
    id: variant.id,
    operations: variant.operations,
  });
  return {
    safe: report.safe,
    findings: report.findings,
    rejected: !report.safe,
  };
}

function evaluateVariant(variant, options) {
  const metrics = options.fitnessMetrics
    ? options.fitnessMetrics(variant)
    : null;
  if (!metrics) return null;
  const fitnessSvc = require('./proceduralFitnessService');
  return fitnessSvc.fitness(options.policy || {}, metrics);
}

function assessCandidate(parent, variant, options) {
  // Step 1: immune inspection of the mutation itself
  const immuneResult = inspectVariant(variant);
  if (immuneResult.rejected) {
    return { stage: 'immune', rejected: true, immune: immuneResult, reason: 'immune inspection rejected the mutation' };
  }
  // Step 2: seal the candidate (version++, hashes recomputed)
  const fitness = evaluateVariant(variant, options);
  const sealed = mutation.sealCandidate(parent, variant, {
    fitness,
    immune: { rejected: false, findings: immuneResult.findings },
  });
  // Step 3: schema validation (hashes verified cryptographically)
  const schema = identity.validateOrganism(sealed);
  if (!schema.valid) {
    return { stage: 'schema', rejected: true, sealed, reason: schema.errors.join('; ') };
  }
  // Step 4: semantic validation (executability)
  const semantic = semantics.validateGraphSemantics(sealed);
  if (!semantic.valid) {
    return { stage: 'semantics', rejected: true, sealed, reason: semantic.errors.join('; ') };
  }
  // Step 5: promotion gate (evidence, robustness, lineage, complexity, non-regression)
  const gateResult = gate.evaluatePromotionGate({
    organism: parent,
    candidate: sealed,
    policy: options.policy || {},
  });
  return { stage: 'gate', rejected: !gateResult.promoted, sealed, gate: gateResult };
}

async function runEvolutionCycle(db, parent, options = {}) {
  // Generate variants from the parent organism
  const variants = mutation.generateVariants(parent, options.variantCount || 5);
  const attempts = [];
  for (const variant of variants) {
    const assessment = assessCandidate(parent, variant, options);
    attempts.push({
      variantId: variant.id,
      operation: variant.operations[0] && variant.operations[0].op,
      ...assessment,
    });
    if (!assessment.rejected) {
      // Persist the promoted candidate as a child of the parent
      const saved = await persistence.persistGenome(db, assessment.sealed, {
        status: 'active',
      });
      return {
        promoted: true,
        saved,
        attempts,
        promotedId: saved.metadata.id,
      };
    }
  }
  return { promoted: false, attempts, reason: 'no variant passed all gates' };
}

module.exports = {
  runEvolutionCycle,
  assessCandidate,
  inspectVariant,
};
