'use strict';
const { normalizeRelativePath } = require('./pathSafety');
const { digest, failure } = require('./trinityProvenanceValues');

function reject() { throw failure('Q7_BOUNDARY_CONTRACT_INVALID'); }
function relative(value) {
  try { return normalizeRelativePath(value, 'boundary contract'); } catch (_) { return reject(); }
}
function paths(value) {
  if (!Array.isArray(value) || !value.length || value.length > 16) reject();
  const result = value.map(relative);
  if (new Set(result).size !== result.length) reject();
  return result;
}
function header(raw) {
  const keys = ['version', 'contractId', 'sourcePaths', 'sourceHashes', 'generatedTestPath', 'visibleTestPaths', 'command', 'visibleCommand', 'api'];
  if (!raw || Object.keys(raw).some(key => !keys.includes(key))
    || raw.version !== 1 || raw.contractId !== 'generated_boundary_tests_v1') reject();
}
function sourceHashes(raw, sourcePaths) {
  if (!raw || Array.isArray(raw) || typeof raw !== 'object'
    || Object.keys(raw).length !== sourcePaths.length) reject();
  const entries = sourcePaths.map(relative => {
    if (!/^[a-f0-9]{64}$/.test(raw[relative])) reject();
    return [relative, raw[relative]];
  });
  return Object.fromEntries(entries);
}
function disjoint(fields) {
  if (fields.sourcePaths.length !== 1 || !fields.sourcePaths[0].endsWith('.cjs')
    || !fields.sourcePaths.every(require('./localCodeWorkerService').safePath)
    || fields.generatedTestPath !== 'boundary-cases.json'
    || fields.sourcePaths.includes(fields.generatedTestPath) || fields.visibleTestPaths.includes(fields.generatedTestPath)
    || fields.sourcePaths.some(item => fields.visibleTestPaths.includes(item))) reject();
}
function commands(raw, fields) {
  const command = 'node .genos/boundary-check.cjs';
  const visibleCommand = raw.visibleCommand || 'npm test';
  if (raw.command !== command || !require('./sandboxCommandPolicy').isAllowedSandboxTestCommand(command)
    || !['npm test', ...fields.visibleTestPaths.map(item => `node ${item}`)].includes(visibleCommand)) reject();
  return { command, visibleCommand };
}
function normalize(raw) {
  header(raw);
  const fields = { sourcePaths: paths(raw.sourcePaths), visibleTestPaths: paths(raw.visibleTestPaths),
    generatedTestPath: relative(raw.generatedTestPath) };
  disjoint(fields);
  let api;
  try { api = require('./codeBoundaryRunner.cjs').api(raw.api); } catch (_) { reject(); }
  return { version: 1, contractId: raw.contractId, ...fields,
    sourceHashes: sourceHashes(raw.sourceHashes, fields.sourcePaths), ...commands(raw, fields), api };
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
  return 'BOUNDARY TEST CONTRACT: Generate boundary-cases.json with data beyond the supplied visible cases. '
    + 'Patch the assigned source and this JSON only. The host owns .genos/boundary-check.cjs. '
    + 'JSON schema: {schema:"genos.boundary-cases/v1",cases:[{id:"case-id",steps:[...]}]}. '
    + 'Steps are {op:"call",name,args,expected}, {op:"construct",name,as,args}, or '
    + '{op:"method",target,name,args,expected}. expectedUndefined:true replaces expected for undefined. '
    + 'Use only the public API allowlist below; each case must assert an actual call or method result. '
    + 'Every call must obey its sealed argument domains: iso8601 includes an explicit Z/offset; '
    + 'numericKeyRecords is a JSON array of records with finite numeric key; integer means safe integer; '
    + 'string and json denote their JSON domains. Signatures fix the exact argument count. '
    + 'At most 20 cases, 40 steps per case, 32 arguments per step. No scripts or source inspections. '
    + 'Do not change visible tests or manifests. The host runs visible tests and these SAME behavioral cases '
    + 'against the original source. Visible tests must pass on both versions, while a real regression assertion '
    + 'must fail on the original source and pass on the candidate. Already passing cases and crashes are not witnesses. '
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
