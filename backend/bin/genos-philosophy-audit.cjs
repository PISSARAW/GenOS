'use strict';

const { compileRegistry } = require('../src/philosophy/implementationContracts');
const { CONCEPT_DEFINITIONS } = require('../src/philosophy/conceptDefinitions');
const { runRegistryExperiments, runContractExperiment } = require('../src/philosophy/contractExperiments');

function main(args) {
  const registry = compileRegistry(CONCEPT_DEFINITIONS);
  if (!registry.valid) throw new Error(registry.errors.join('; '));
  if (args[0] === '--contract' && args.length === 2) {
    const contract = registry.contracts.find((item) => item.id === args[1]);
    if (!contract) throw new Error('unknown contract');
    const receipt = runContractExperiment(contract);
    process.stdout.write(JSON.stringify(receipt) + '\n');
    return receipt.passed;
  }
  if (args.length !== 1 || args[0] !== '--coverage') throw new Error('Usage: --coverage | --contract <id>');
  const report = runRegistryExperiments(registry.contracts);
  const receipts = report.receipts.map(({ contractId, contractHash, receiptHash, passed }) =>
    ({ contractId, contractHash, receiptHash, passed }));
  process.stdout.write(JSON.stringify({ ...report, receipts }) + '\n');
  return report.failed.length === 0;
}

try { process.exitCode = main(process.argv.slice(2)) ? 0 : 1; }
catch (error) { console.error(error.message); process.exitCode = 1; }
