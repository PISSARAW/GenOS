'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const backendRoot = path.resolve(__dirname, '..');
const topologyChecks = Object.freeze([
  { id: 'trinity', label: 'Trinity', scripts: [
    ['tests/run_trinity_suite.js'], ['tests/test_gqwf_trinity_mission_qualification.js']] },
  { id: 'a_team', label: 'A-Team', scripts: [
    ['tests/test_ateam_execution_e2e.js'], ['tests/test_ateam_terminal_wait.js'],
    ['tests/test_ateam_multiteam_runtime.js']] },
  { id: 'biome', label: 'Biome', scripts: [['tests/run_biome_suite.js']] },
  { id: 'biocenose', label: 'Biocenose', scripts: [['tests/run_biocenose_suite.js']] },
  { id: 'rhizome', label: 'Rhizome', scripts: [['tests/run_rhizome_suite.js']] },
  { id: 'syncytium', label: 'Syncytium', scripts: [['tests/run_syncytium_suite.js']] },
  { id: 'holobionte', label: 'Holobiont', scripts: [['tests/run_holobiont_suite.js']] },
  { id: 'metapopulation', label: 'Metapopulation', scripts: [
    ['tests/run_validation_suite.js', 'metapopulation']] }
]);

const boundaryChecks = Object.freeze([
  { id: 'worker_wait', label: 'Attached worker completion',
    scripts: [['tests/test_topology_worker_wait_contract.js'],
      ['tests/test_biological_mission_completion.js'], ['tests/test_worker_result_reader.js']] },
  { id: 'variant_fallback', label: 'Variant fallback traceability',
    scripts: [['tests/test_topology_variant_fallback_traceability.js']] },
  { id: 'biological_receipts', label: 'Biological receipts and restart',
    scripts: [['tests/run_biology_suite.cjs']] },
  { id: 'morphogenesis_commit', label: 'Governed morphogenesis commit',
    scripts: [['tests/test_morphogenesis_authenticated_commit.js']] },
  { id: 'llm_stdio', label: 'LLM runtime startup and stdio',
    scripts: [['tests/test_orchestrator_local_models.js']] }
]);

function runScript(command) {
  const [script, ...args] = command;
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: backendRoot, stdio: 'inherit', timeout: 600000, windowsHide: true
  });
  if (result.status === 0) return null;
  return result.error?.message || `exit ${result.status}`;
}

function execute(check) {
  console.log(`\n=== ${check.label} ===`);
  for (const command of check.scripts) {
    const reason = runScript(command);
    if (reason) return { id: check.id, label: check.label, reason };
  }
  return null;
}

function selectedTopologies(args) {
  const option = args.find((item) => item.startsWith('--topology='));
  if (!option) return topologyChecks;
  const requested = option.slice('--topology='.length).trim().toLowerCase();
  const selected = topologyChecks.filter((item) => item.id === requested);
  if (!selected.length) throw new Error(`Unknown topology '${requested}'.`);
  return selected;
}

function printCatalog() {
  console.log(topologyChecks.map((item) => `${item.id}: ${item.label}`).join('\n'));
  console.log('\nBoundary checks:');
  console.log(boundaryChecks.map((item) => `${item.id}: ${item.label}`).join('\n'));
}

function runChecks(checks) {
  return checks.map(execute).filter(Boolean);
}

function main(args = process.argv.slice(2)) {
  if (args.includes('--list')) { printCatalog(); return; }
  const topologies = selectedTopologies(args);
  const includeBoundaries = !args.some((item) => item.startsWith('--topology='));
  const topologyFailures = runChecks(topologies);
  const boundaryFailures = includeBoundaries ? runChecks(boundaryChecks) : [];
  const failures = [...topologyFailures, ...boundaryFailures];
  console.log(`\nTopology contract checks: ${topologies.length - topologyFailures.length}/${topologies.length} passed.`);
  if (includeBoundaries) {
    console.log(`Boundary checks: ${boundaryChecks.length - boundaryFailures.length}/${boundaryChecks.length} passed.`);
  }
  console.log('Controlled contracts do not certify a live provider or production deployment.');
  if (failures.length) {
    console.error(JSON.stringify(failures, null, 2));
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { topologyChecks, boundaryChecks, selectedTopologies, runScript, execute, main };
