'use strict';
const { contractFingerprint } = require('../../philosophy/contractFingerprint');
const { compileConcept, runReadinessProbe } = require('../../philosophy/implementationContracts');
const { CONCEPT_DEFINITIONS } = require('../../philosophy/conceptDefinitions');
const OBSERVATION_FILE = '.genos/philosophy-observations.json';

function referenceFor(contract) {
  if (!contract) return null;
  return {
    id: contract.id, contractHash: contractFingerprint(contract), category: contract.category,
    maturity: contract.maturity, compilationState: contract.compilationState,
    readiness: runReadinessProbe(contract).status,
    scenarioId: contract.scenario.id, experimentId: contract.experiment.id,
    evidenceRequired: contract.experiment.evidenceRequired, topologies: contract.experiment.topologies,
    execution: contract.execution, observationFile: OBSERVATION_FILE, promotionEligible: false,
  };
}

function contractsFor(references) {
  if (!Array.isArray(references) || references.length > 375) throw new Error('selection-philosophique-invalide');
  const ids = new Set();
  return references.map((reference) => {
    if (ids.has(reference.id)) throw new Error('contrat-philosophique-duplique');
    ids.add(reference.id);
    const concept = CONCEPT_DEFINITIONS.find((item) => item.id === reference.id);
    if (!concept) throw new Error('contrat-philosophique-inconnu');
    const contract = compileConcept(concept);
    if (reference.contractHash !== contractFingerprint(contract)) throw new Error('contrat-philosophique-obsolete');
    return contract;
  });
}

function requiredReferences(references) {
  return (references || []).filter((reference) => reference.requiredForMission !== false);
}

function instructionFor(references) {
  const required = requiredReferences(references);
  if (!required.length) return 'Philosophical audits are advisory; no permissions are added.';
  return `Required bounded philosophical audit: produce ${OBSERVATION_FILE} with missionId, contractHashes and bindings. Each binding maps the contract execution.field to {file, pointer} in a JSON evidence file inside the candidate workspace. Missing or violated criteria block verification. Observations remain declared facts, not independently established philosophical truths. Requirements: ${JSON.stringify(required)}`;
}
module.exports = { OBSERVATION_FILE, referenceFor, contractsFor, requiredReferences, instructionFor };
