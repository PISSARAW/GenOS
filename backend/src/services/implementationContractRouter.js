'use strict';

const {
  compileRegistry,
  compileConcept,
  readinessReport,
  assessPromotion,
} = require('../philosophy/implementationContracts');

function copy(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function implementationContractHealth(definitions) {
  const result = compileRegistry(definitions);
  return {
    ...result,
    registeredConcepts: definitions.length,
    compiledConcepts: result.contracts.length,
  };
}

function listImplementationContracts(definitions, args = {}) {
  const result = compileRegistry(definitions);
  return result.contracts
    .filter((item) => !args.target || item.targets.includes(args.target))
    .map(copy);
}

function getImplementationContract(concept) {
  return copy(compileConcept(concept));
}

function assessContractPromotion(concept, targetMaturity, evidence) {
  return assessPromotion(compileConcept(concept), targetMaturity, evidence);
}

module.exports = {
  implementationContractHealth,
  listImplementationContracts,
  getImplementationContract,
  readinessReport,
  assessContractPromotion,
};
