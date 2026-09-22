'use strict';

const { executeVerifierWithAdapter, computeEvidenceDigest } = require('./verifierAdapters');
const { buildPreReceipt } = require('./verifierReceiptBuilder');
const { issueReceipt } = require('../epistemicVerifierReceiptService');

function mapVerifierTypeToAdapter(verifierType) {
  const map = {
    testResult: 'test',
    test: 'test',
    coverage: 'coverage',
    behavior: 'behavior',
    counterexample: 'behavior',
    artifact: 'artifact',
    repro: 'artifact',
    replay: 'test',
  };
  return map[verifierType] || verifierType;
}

async function executeVerifier(antigen, verifier, context = {}) {
  if (!antigen || !verifier) {
    return {
      status: 'inconclusive',
      reason: 'antigen or verifier missing',
      observations: [],
      counterexamples: [],
    };
  }

  const adapterType = mapVerifierTypeToAdapter(verifier.type);
  const mappedVerifier = { ...verifier, type: adapterType };
  const adapterContext = { ...context, originalVerifierType: verifier.type };

  const { status, observations, counterexamples } = await executeVerifierWithAdapter(
    antigen,
    mappedVerifier,
    adapterContext
  );

  const preReceipt = buildPreReceipt({
    resultId: antigen.id,
    evidenceDigest: antigen.epitopes?.evidence?.digest || computeEvidenceDigest(observations),
    verifierDigest: verifier.type,
    status,
    observations,
    counterexamples,
  });

  const signedReceipt = issueReceipt(preReceipt);

  return {
    status,
    resultId: antigen.id,
    evidenceDigest: antigen.epitopes?.evidence?.digest || signedReceipt.evidenceDigest,
    verifierDigest: verifier.type,
    observations,
    counterexamples,
    receipt: signedReceipt,
    executedAt: new Date().toISOString(),
  };
}

async function checkForCounterexample(antigen, verifier) {
  const { runBehaviorAdapter } = require('./verifierAdapters');
  const result = await runBehaviorAdapter(antigen, verifier, {});
  return result?.counterexamples?.length > 0;
}

async function executeVerifiers(antigen, verifiers, context = {}) {
  if (!verifiers || !verifiers.length) {
    return { status: 'no_verifier', results: [] };
  }
  const results = await Promise.all(
    verifiers.map((v) => executeVerifier(antigen, v, context))
  );
  const verified = results.filter((r) => r.status === 'verified').length;
  const refuted = results.filter((r) => r.status === 'refuted').length;
  const inconclusive = results.filter((r) => r.status === 'inconclusive').length;

  return {
    status: refuted > 0 ? 'refuted' : (verified > 0 ? 'verified' : 'inconclusive'),
    results,
    summary: { verified, refuted, inconclusive },
  };
}

module.exports = {
  executeVerifier,
  executeVerifiers,
  checkForCounterexample,
};
