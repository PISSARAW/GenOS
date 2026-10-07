'use strict';

const contracts = require('../epistemic/codePostconditionContract');
const { resultReport } = require('./workerNativeEvidence');

async function runCode(method, context) {
  contracts.assertInput(method);
  const source = await require('../epistemic/codeArtifactSource').load({ method, workspaceRoot: context.mission.workspaceRoot });
  const checked = require('../epistemic/oracleCodeChecks').checkCode(source, 'code_remainder');
  const evidence = [`genos://code/${source.artifact.contentHash}`];
  const output = { testedClaim: contracts.STATEMENT, verificationMethod: 'bounded_code_postconditions',
    verdict: { verified: 'accept', refuted: 'reject' }[checked.status] || 'unresolved',
    artifactPath: source.artifact.path, artifactContentHash: source.artifact.contentHash,
    contractId: source.contract.id, contractHash: source.contractHash, evidence,
    reproductionSteps: ['Read the assigned workspace artifact with its expected hash.',
      'Evaluate its bounded expression for every input in the versioned contract.'] };
  return resultReport(method, output, { type: 'verification_report', statement: contracts.STATEMENT, sourceRefs: evidence });
}

module.exports = { assertCodeInput: contracts.assertInput, runCode };
