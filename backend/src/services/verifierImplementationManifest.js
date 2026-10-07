"use strict";
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const SOURCES = Object.freeze([
  'verifierTrustRegistry.js', 'epistemic/verifierAdapters.js',
  'epistemic/verifierRuntimeBridge.js', 'epistemic/verifierReceiptBuilder.js',
  'epistemicVerifierReceiptService.js', 'sandboxExecutor.js',
  'epistemicReceiptKeyring.js', 'epistemic/claimVerificationContract.js',
  'epistemic/sandboxTarget.js', 'epistemic/aeisPromotionBridge.js',
  'epistemic/epistemicHomeostaticRearbitration.js',
  'epistemic/verifierEvidence.js', 'epistemic/epistemicHomeostaticArbitration.js',
  'sandboxCommandPolicy.js', 'epistemicScheduler/independencePolicy.js',
  'gvxVerifierRegistry.js', 'gvxVerifierControlPlaneRegistry.js', 'gvxBuiltinVerifiers.js',
  'gvxRemoteVerifierClient.js', 'gvxVerifierServiceServer.js',
  'developmentalBridge/developmentReceiptVerifier.js',
  'developmentalBridge/gvxToAgowReceiptAdapter.js',
  'developmentalBridge/agowToGvxSignalAdapter.js', 'gvxLifecycleAdapterProvider.js',
  'epistemicAssuranceService.js', 'gvxSomaticAssessment.js', 'gvxDevelopmentController.js',
  'epistemic/oracleSubsetChecks.js', 'epistemic/oracleNativeEntry.cjs',
  'epistemic/oracleNativeProcess.js', 'epistemic/oracleProcedureSubject.js', 'epistemic/oracleProcedureAdapter.js',
  'biologicalWorkerStore.js', 'biologicalIntegrity.js', 'gvxMissionProvenance.js',
  'gvxDevelopmentLedger.js', 'gvxLedgerIntegrity.js', 'trinityProvenanceValues.js', 'formalResultService.js',
  'epistemic/nativeOracleBudget.js', 'epistemic/nativeOracleJournal.js', 'epistemic/oracleProcedureClaim.js',
  'epistemic/nativeOracleCoordinator.js', 'epistemic/nativeOracleProof.js', 'epistemic/nativeOracleGate.js',
  'missionEnvelopeAuthority.js', 'promotionVerifierNonceService.js',
  'epistemic/oracleMemorySubject.js', 'epistemic/oracleMemoryChecks.js',
  'epistemic/oracleMemoryNativeEntry.cjs', 'epistemic/oracleMemoryAdapter.js', 'promotionMemoryReadGate.js',
  'aeisAssemblyStore.js', 'aeisAssemblyRetraction.js',
  'epistemic/nativeOracleDomains.js', 'epistemic/oracleMemoryRuntimeSubject.js',
  'epistemic/oracleMemoryClaim.js', 'agents/workerMemoryVerification.js',
  'agents/workerExecutorRegistry.js', 'agents/workerNativeMethodCapabilities.js',
]);
function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
function implementationManifest() {
  return { schema: 'genos.verifier-implementation/v1', node: process.version,
    sources: SOURCES.map((name) => ({ path: name, sha256: digest(fs.readFileSync(path.join(__dirname, name))) })) };
}
module.exports = { implementationManifest, digest };
