'use strict';

const {
  compileRegistry,
  compileConcept,
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

module.exports = {
  implementationContractHealth,
  listImplementationContracts,
  getImplementationContract,
};
