'use strict';
const { normalizeRelativePath } = require('./pathSafety');
const { digest, failure } = require('./trinityProvenanceValues');

function reject() { throw failure('Q7_BOUNDARY_CONTRACT_INVALID'); }
function paths(value) {
  if (!Array.isArray(value) || !value.length || value.length > 16) reject();
  const result = value.map(item => normalizeRelativePath(item, 'boundary contract'));
  if (new Set(result).size !== result.length) reject();
  return result;
}
function header(raw) {
  const keys = ['version', 'contractId', 'sourcePaths', 'generatedTestPath', 'visibleTestPaths', 'command', 'visibleCommand'];
  if (!raw || Object.keys(raw).some(key => !keys.includes(key))
    || raw.version !== 1 || raw.contractId !== 'generated_boundary_tests_v1') reject();
}
function disjoint(fields) {
  if (!require('./localCodeWorkerService').safePath(fields.generatedTestPath)
    || fields.sourcePaths.includes(fields.generatedTestPath) || fields.visibleTestPaths.includes(fields.generatedTestPath)
    || fields.sourcePaths.some(item => fields.visibleTestPaths.includes(item))) reject();
}
function commands(raw, fields) {
  const command = `node ${fields.generatedTestPath}`;
  const visibleCommand = raw.visibleCommand || 'npm test';
  if (raw.command !== command || !require('./sandboxCommandPolicy').isAllowedSandboxTestCommand(command)
    || !['npm test', ...fields.visibleTestPaths.map(item => `node ${item}`)].includes(visibleCommand)) reject();
  return { command, visibleCommand };
}
function normalize(raw) {
  header(raw);
  const fields = { sourcePaths: paths(raw.sourcePaths), visibleTestPaths: paths(raw.visibleTestPaths),
    generatedTestPath: normalizeRelativePath(raw.generatedTestPath, 'generated boundary test') };
  disjoint(fields);
  return { version: 1, contractId: raw.contractId, ...fields, ...commands(raw, fields) };
}
function read(mission = {}) {
  const raw = mission.boundaryTestContract || mission.workerContract?.mission?.boundaryTestContract;
  if (!raw) return null;
  const contract = normalize(raw);
  const assigned = mission.workerContract?.mission?.boundaryTestContract;
  if (assigned && digest(normalize(assigned)) !== digest(contract)) reject();
  return contract;
}
function instruction(mission) {
  const contract = read(mission);
  if (!contract) return '';
  return 'BOUNDARY TEST CONTRACT: Generate a new boundary-check script with assertions beyond the supplied visible cases. '
    + 'Patch the assigned sources and this dedicated script. Do not change visible tests or manifests. '
    + 'The host will run visible tests and the generated script on the candidate, then run the SAME generated script '
    + 'against the original source. Visible tests must pass on both versions, while a real regression assertion '
    + 'must fail on the original source and pass on the candidate. Copied tests, tautologies and crashes are not witnesses. '
    + 'This establishes a finite regression argument, not universal correctness. '
    + JSON.stringify(contract);
}
function authorityBinding(mission) {
  const contract = read(mission);
  return contract ? { boundaryTestContractHash: digest(contract) } : {};
}
function assertAuthority(envelope, mission) {
  if (envelope.boundaryTestContractHash !== authorityBinding(mission).boundaryTestContractHash) {
    throw failure('EXECUTION_AUTHORITY_CONTEXT_CHANGED');
  }
}
module.exports = { read, normalize, instruction, authorityBinding, assertAuthority };
