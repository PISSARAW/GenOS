'use strict';

const fitnessService = require('./proceduralFitnessService');
const promotionGate = require('./proceduralPromotionGateService');

function withFitness(genome) {
  const source = genome || {};
  if (source.fitness && typeof source.fitness.score === 'number') return source;
  return { ...source, fitness: fitnessService.fitness(source.policy, source.metrics) };
}

function promoteCandidate(organism, candidate) {
  const before = withFitness(organism);
  const after = withFitness(candidate);
  const policy = (candidate && candidate.policy) || (organism && organism.policy) || {};
  const gate = promotionGate.evaluatePromotionGate({ organism: before, candidate: after, policy });
  const receipt = promotionGate.createPromotionReceipt({ organism: before, candidate: after, result: gate });
  const deployment = gate.promoted
    ? { deployed: true, genome: after, previousId: before.metadata ? before.metadata.id : null, receiptId: receipt.id }
    : { deployed: false, genome: before, blockedBy: gate.blocking.map((g) => g.name), receiptId: receipt.id };
  return { fitnessBefore: before.fitness, fitnessAfter: after.fitness, gate, receipt, deployment };
}

module.exports = { withFitness, promoteCandidate };
