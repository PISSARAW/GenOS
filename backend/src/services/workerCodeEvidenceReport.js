'use strict';

const values = require('./trinityProvenanceValues');

function build(input) {
  const { mission, proposal } = input;
  const files = proposal?.changedFileHashes;
  const tests = proposal?.tests;
  if (proposal?.testStatus !== 'passed' || !Array.isArray(files) || files.length === 0
    || !Array.isArray(tests) || tests.length === 0 || tests.some((test) => test.exitCode !== 0)) {
    throw Object.assign(new Error('A code worker needs changed files and passing executed tests.'), {
      code: 'WORKER_CODE_EVIDENCE_INCOMPLETE'
    });
  }
  const fileRefs = files.map((file) => `genos://code-file/${values.digest(file)}`);
  const testRefs = tests.map((test) => `genos://code-test/${values.digest(test)}`);
  const evidence = [...fileRefs, ...testRefs];
  const names = files.map((file) => file.path).join(', ');
  const commands = tests.map((test) => test.command).join(', ');
  const claim = { statement: `Changed ${names}; executed ${commands} and every test command exited successfully.`, evidence };
  const codeVerification = verificationBinding(mission, files);
  const kindEvidence = kindSpecificEvidence(mission, evidence);
  return { outcome: 'success', claims: [claim], ...(codeVerification ? { codeVerification } : {}),
    scopeCompletion: { scopeRef: mission.workerContract?.mission?.scope || mission.workspaceRoot,
      completedRefs: fileRefs }, ...kindEvidence, tests };
}

function kindSpecificEvidence(mission, evidence) {
  const kind = mission.workerContract?.identity?.workerKind || mission.workerKind;
  if (kind === 'specialist') {
    const niche = mission.workerContract?.mission?.specialtyNiche
      || mission.workerContract?.niche?.domain || mission.specialtyNiche || mission.nicheDomain;
    if (typeof niche !== 'string' || !niche.trim()) {
      throw Object.assign(new Error('A specialist code worker needs its declared niche.'), {
        code: 'WORKER_CODE_EVIDENCE_INCOMPLETE'
      });
    }
    return { specialtyAssessment: { niche, inScope: true, evidence } };
  }
  if (kind === 'adaptive_worker') {
    const strategy = mission.workerContract?.mission?.methodContract?.methodId
      || mission.methodContract?.methodId || mission.strategyId;
    if (typeof strategy !== 'string' || !strategy.trim()) {
      throw Object.assign(new Error('An adaptive code worker needs its declared method strategy.'), {
        code: 'WORKER_CODE_EVIDENCE_INCOMPLETE'
      });
    }
    return { strategyTrace: [{ strategy, decision: 'retained',
      reason: `Applied the declared ${strategy} method to produce the tested code change.`, evidence }] };
  }
  return {};
}

function verificationBinding(mission, files) {
  const contract = mission.workerContract?.mission?.codeVerificationContract;
  if (!contract) return null;
  const matches = files.filter((file) => file.path === contract.artifactPath);
  if (matches.length !== 1 || contract.contractId !== 'euclidean_modulo_v1') {
    throw Object.assign(new Error('The assigned code verification artifact was not changed exactly once.'), {
      code: 'WORKER_CODE_EVIDENCE_INCOMPLETE'
    });
  }
  const sourceContract = require('./epistemic/codePostconditionContract');
  return { artifactPath: contract.artifactPath, contractId: contract.contractId,
    artifactContentHash: matches[0].hash, contractHash: sourceContract.hash(),
    testedClaim: sourceContract.STATEMENT };
}

module.exports = { build };
