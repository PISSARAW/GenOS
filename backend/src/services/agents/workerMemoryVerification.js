'use strict';

const { methodInput, text, error, resultReport } = require('./workerNativeEvidence');
const values = require('../trinityProvenanceValues');
const subjects = require('../epistemic/oracleMemorySubject');

function assertMemoryInput(method) {
  const input = methodInput(method, 'verify_memory_fidelity');
  if (!text(input.memoryId, 256) || !/^[a-f0-9]{64}$/.test(input.expectedBindingHash || '')) {
    throw error('WORKER_MEMORY_SUBJECT_REQUIRED', 'A persisted memory and its expected source binding hash are required.');
  }
  return true;
}

async function runMemory(method, context) {
  assertMemoryInput(method);
  const scope = await require('../gvxMissionProvenance').agentScope(context.db, context.mission.agentId);
  if (!scope) throw error('WORKER_MEMORY_SCOPE_REQUIRED', 'Verification requires a persisted tenant identity.');
  const subject = await subjects.load(context.db, { memoryId: method.parameters.memoryId,
    scope: { organizationId: scope.organizationId, projectId: scope.projectId } });
  if (values.digest(subject.binding) !== method.parameters.expectedBindingHash) throw values.failure('MEMORY_ORACLE_ORIGIN_MISMATCH');
  const checked = require('../epistemic/oracleMemoryChecks').checkMemory(subject.content, 'memory_rendered');
  const output = { testedClaim: subjects.STATEMENT, verificationMethod: 'recorded_source_fidelity',
    verdict: { verified: 'accept', refuted: 'reject' }[checked.status] || 'unresolved',
    memoryId: method.parameters.memoryId, memoryBindingHash: method.parameters.expectedBindingHash,
    sourceTruth: 'not_evaluated', evidence: [`genos://memories/${method.parameters.memoryId}`],
    reproductionSteps: ['Resolve the scoped promotion journal and memory provenance.', 'Compare the memory text and claims with the recorded source.'] };
  return resultReport(method, output, { type: 'verification_report', statement: subjects.STATEMENT, sourceRefs: output.evidence });
}

module.exports = { assertMemoryInput, runMemory };
