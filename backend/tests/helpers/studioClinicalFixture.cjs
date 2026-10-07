'use strict';
async function seedClinical(spec) {
  const clinical = require('../../src/services/medical/clinicalStateService');
  await clinical.initClinicalState(spec.db, spec.settings.agent);
  return clinical.refreshClinicalState(spec.db, spec.settings.agent, { cognitiveIntegrity: 0.6, stress: 0.9,
    energy: 0.2, budgetRatio: 0.3, dissonance: 0.9, immuneTiter: 0.5, inflammatoryIndex: 0.3,
    plasmidLoad: 0.2, pathogenBurden: 0.2, iatrogenicLoad: 0.2 });
}
module.exports = { seedClinical };
