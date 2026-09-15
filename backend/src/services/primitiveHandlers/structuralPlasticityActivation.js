'use strict';

async function activateStructuralPlasticity(ctx = {}) {
  const { runConsolidationCycle } = require('../structuralConsolidationService');
  const { computeStructuralPlasticityIndex } = require('../structuralPlasticityIndex');
  const consolidation = await runConsolidationCycle(ctx);
  const spi = await computeStructuralPlasticityIndex({ ...ctx, forceRefresh: true });
  return {
    success: consolidation.success,
    trigger: consolidation.trigger,
    consolidation_phases: consolidation.phases,
    structural_plasticity_index: spi.structural_plasticity_index,
    spi_grade: spi.grade,
    reason: `Activation de la plasticité structurelle terminée (SPI=${spi.structural_plasticity_index}).`
  };
}

module.exports = { activateStructuralPlasticity };