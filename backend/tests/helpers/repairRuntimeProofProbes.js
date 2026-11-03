'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const proofService = require('../../src/services/epistemic/nativeOracleProof');
const authority = require('../../src/services/missionEnvelopeAuthority');

async function qualify(db, input) {
  const event = input.event;
  const saved = await authority.read(db, event.payload.executionRunId);
  const request = { runId: event.payload.executionRunId, agentId: input.agentId, scope: saved.envelope.scope };
  const proof = await proofService.read(db, { ...request, reference: event.payload.nativeOracleRef });
  const report = event.payload.evidenceReport || event.payload.report;
  await proofService.assertCurrent(db, { proof, request, report });
  await assert.rejects(proofService.read(db, { ...request, scope: { ...request.scope, organizationId: 'other' },
    reference: event.payload.nativeOracleRef }));
  const forged = structuredClone(proof);
  const receipt = forged.saved.evaluation.assembly.verifications[0];
  receipt.executionEvidence[0].postconditions.coverage.obligations.pop();
  forged.saved.evaluation.assembly.verifications[0] = require('../../src/services/epistemicVerifierReceiptService').issueReceipt(receipt);
  await assert.rejects(proofService.assertCurrent(db, { proof: forged, request, report }),
    { code: 'REPAIR_OBLIGATION_RECEIPT_BINDING_MISMATCH' });
  await changedArtifact(db, { proof, request, report, root: saved.envelope.workspaceRoot });
  process.stdout.write('REPAIR_CURRENT_PROOF_PROBES_PASS\n');
}

async function changedArtifact(db, context) {
  const { proof, request, report } = context;
  const contract = proof.saved.evaluation.assembly.results[0].evidence.content.contract;
  const artifact = require('../../src/services/pathSafety').resolveContainedPathNoSymlinkSync(context.root, contract.artifactPath);
  const bytes = await fs.readFile(artifact);
  try {
    await fs.writeFile(artifact, '0');
    await assert.rejects(proofService.assertCurrent(db, { proof, request, report }),
      { code: 'ORACLE_COMPLETION_RESULT_CHANGED' });
  } finally { await fs.writeFile(artifact, bytes); }
  await proofService.assertCurrent(db, { proof, request, report });
}

module.exports = { qualify };
