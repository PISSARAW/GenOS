'use strict';

/**
 * @file structuralPlasticityActivation.js
 * @description Primitive d'orchestration native — active la plasticité
 * structurelle (Rust-side: exposable via l'orchestrateur natif).
 *
 * Déclenche un cycle de consolidation structurelle + recalcule l'index SPI.
 * État : idempotent (sûr au redémarrage, pas d'état module-level persistant).
 */

const { runConsolidationCycle } = require('../structuralConsolidationService');
const { computeStructuralPlasticityIndex } = require('../structuralPlasticityIndex');

async function activateStructuralPlasticity(context = {}) {
  const opts = Object.assign({}, context, { forceRefresh: true });
  const consolidation = await runConsolidationCycle(opts);
  const spi = await computeStructuralPlasticityIndex(opts);

  return {
    success: consolidation.success && spi.success,
    trigger: consolidation.trigger,
    consolidation_phases: consolidation.phases,
    structural_plasticity_index: spi.structural_plasticity_index,
    spi_grade: spi.grade,
    reason: `Activation de la plasticité structurelle terminée (SPI=${spi.structural_plasticity_index}, grade=${spi.grade}).`
  };
}

module.exports = { activateStructuralPlasticity };
