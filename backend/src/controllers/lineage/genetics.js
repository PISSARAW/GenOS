/**
 * Genome phylogeny, allele and crossover endpoints.
 */

const telemetry = require('../../services/telemetryObserver');
const geneticsService = require('../../services/geneticsService');

async function getPhylogeny(req, res, next) {
  try {
    const workspaceId = req.query.workspaceId || 'ws-genos-core';
    const tree = await geneticsService.getPhylogeneticTree(workspaceId);
    res.json(tree);
  } catch (err) {
    next(err);
  }
}

async function getAlleles(req, res, next) {
  try {
    const alleles = await geneticsService.analyzeAlleles(req.tenant || {});
    res.json(alleles);
  } catch (err) {
    next(err);
  }
}

async function performCrossover(req, res, next) {
  try {
    const { parentA, parentB, options } = req.body || {};
    if (!parentA?.genes || !parentB?.genes) {
      return res.status(400).json({ error: { code: 'PARENT_GENOMES_REQUIRED', message: 'Two explicit parent genomes are required.' } });
    }
    const result = geneticsService.crossoverGenome(parentA, parentB, options);

    telemetry.emitEvent({
      eventType: 'GENOME_CROSSOVER_SYNTHESIZED',
      agentId: 'genome_factory',
      action: 'CROSSOVER',
      detail: `Synthesized child agent DNA '${result.childId}' with fitness score ${result.predictedFitnessScore}`,
      severity: 'info',
      payload: result
    });

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getPhylogeny,
  getAlleles,
  performCrossover
};
