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
const attestations = require('../philosophy/independentAttestation');
const workers = require('../philosophy/workerMissionExperiments');
const { pageContracts } = require('../philosophy/contractPagination');
const EXECUTION_OPERATIONS = ['executeImplementationContract', 'runImplementationExperiment',
  'implementationExperimentCoverage', 'listRepresentativeMissions', 'runRepresentativeMission',
  'representativeMissionCoverage', 'runOrganizationComparison', 'organizationComparisonCoverage',
  'runPhilosophyRuntimeEvidence', 'admitIndependentPhilosophyAttestation',
  'runWorkerPhilosophyMission', 'workerPhilosophyCoverage'];

function workerOperation(operation, args, contracts) {
  const handlers = {
    runWorkerPhilosophyMission: () => workers.runWorkerMission(contracts(), args),
    workerPhilosophyCoverage: async () => {
      const report = await workers.runWorkerCoverage(contracts());
      return { ...report, receipts: report.receipts.map(({ missionId, organization, receiptHash, passed,
        measuredCosts }) => ({ missionId, organization, receiptHash, passed, measuredCosts })) };
    },
  };
  return handlers[operation]?.();
}

function runContractOperation(operation, contract, context) {
  const handlers = {
    executeImplementationContract: () => execute(contract, context.args),
    runImplementationExperiment: () => experiments.runContractExperiment(contract),
    runPhilosophyRuntimeEvidence: () => attestations.runRuntimeEvidence(contract, context.contracts()),
    admitIndependentPhilosophyAttestation: () => attestations.admitIndependentAttestation(contract, {
      runtimeReceipt: context.args.runtimeReceipt,
      verifierReceipt: context.args.verifierReceipt,
      contracts: context.contracts(),
    }),
  };
  return handlers[operation]();
}

function handleExecution(operation, args, definitions) {
  const contracts = () => compileRegistry(definitions).contracts;
  const workerResult = workerOperation(operation, args, contracts);
  if (workerResult) return workerResult;
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
  return runContractOperation(operation, contract, { args, contracts });
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

function assessContractPromotion(concept, targetMaturity, input) {
  const evidence = Array.isArray(input) ? input : input?.evidence || [];
  const concepts = Array.isArray(input?.concepts) ? input.concepts : [];
  const contracts = concepts.length ? compileRegistry(concepts).contracts : [];
  return assessPromotion(compileConcept(concept), targetMaturity, { evidence, contracts });
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
