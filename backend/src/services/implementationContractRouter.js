'use strict';

const {
  compileRegistry,
  compileConcept,
  readinessReport,
  assessPromotion,
} = require('../philosophy/implementationContracts');
const { execute } = require('../philosophy/contractRuntime');
const experiments = require('../philosophy/contractExperiments');
const { pageContracts } = require('../philosophy/contractPagination');
const EXECUTION_OPERATIONS = ['executeImplementationContract', 'runImplementationExperiment', 'implementationExperimentCoverage'];

function handleExecution(operation, args, definitions) {
  if (operation === 'implementationExperimentCoverage') {
    const report = experiments.runRegistryExperiments(compileRegistry(definitions).contracts);
    return { ...report, receipts: report.receipts.map(({ contractId, contractHash, receiptHash, passed }) =>
      ({ contractId, contractHash, receiptHash, passed })) };
  }
  const concept = definitions.find((item) => item.id === (args.conceptId || args.id));
  if (!concept) throw new Error('Unknown implementation contract');
  const contract = compileConcept(concept);
  return operation === 'executeImplementationContract' ? execute(contract, args)
    : experiments.runContractExperiment(contract);
}

function copy(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function implementationContractHealth(definitions) {
  const result = compileRegistry(definitions);
  const { contracts, ...health } = result;
  return {
    ...health,
    registeredConcepts: definitions.length,
    compiledConcepts: contracts.length,
  };
}

function listImplementationContracts(definitions, args = {}) {
  return implementationContractPage(definitions, args).contracts;
}

function implementationContractPage(definitions, args = {}) {
  return pageContracts(compileRegistry(definitions).contracts, args);
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
  implementationContractPage,
  getImplementationContract,
  readinessReport,
  assessContractPromotion,
  EXECUTION_OPERATIONS, handleExecution,
};
