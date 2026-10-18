'use strict';

const {
  compileRegistry,
  compileConcept,
  readinessReport,
  assessPromotion,
} = require('../philosophy/implementationContracts');
const { execute } = require('../philosophy/contractRuntime');
const experiments = require('../philosophy/contractExperiments');
const representative = require('../philosophy/representativeMissionExperiments');
const organizations = require('../philosophy/organizationMissionExperiments');
const { pageContracts } = require('../philosophy/contractPagination');
const EXECUTION_OPERATIONS = ['executeImplementationContract', 'runImplementationExperiment',
  'implementationExperimentCoverage', 'listRepresentativeMissions', 'runRepresentativeMission',
  'representativeMissionCoverage', 'runOrganizationComparison', 'organizationComparisonCoverage'];

function handleExecution(operation, args, definitions) {
  const contracts = () => compileRegistry(definitions).contracts;
  if (operation === 'listRepresentativeMissions') return { missions: representative.listRepresentativeMissions() };
  if (operation === 'runRepresentativeMission') {
    return representative.runRepresentativeMission(contracts(), args.missionId);
  }
  if (operation === 'representativeMissionCoverage') {
    const report = representative.runRepresentativeCoverage(contracts());
    return { ...report, receipts: report.receipts.map(({ missionId, receiptHash, passed, measuredCosts }) =>
      ({ missionId, receiptHash, passed, measuredCosts })) };
  }
  if (operation === 'runOrganizationComparison') {
    return organizations.runOrganizationComparison(contracts(), args.missionId);
  }
  if (operation === 'organizationComparisonCoverage') {
    const report = organizations.runOrganizationCoverage(contracts());
    return { ...report, receipts: report.receipts.map(({ missionId, receiptHash, passed, budgetParity, outcomeParity }) =>
      ({ missionId, receiptHash, passed, budgetParity, outcomeParity })) };
  }
  if (operation === 'implementationExperimentCoverage') {
    const report = experiments.runRegistryExperiments(contracts());
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
