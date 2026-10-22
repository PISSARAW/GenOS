'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  DOSSIER_SCHEMA,
  VERIFICATION_SCHEMA,
  PRESENTATION_SCHEMA,
  BUNDLE_SCHEMA,
  AUTHORITY_MODEL,
  failure,
  canonicalJson,
  parseCanonical,
  computeDigest,
  fingerprint
} = require('./serePrimitives');
const { assembleSereDossier, fromRemediationCampaign } = require('./sereDossierAssembler');
const {
  assertAuthoritativeSource,
  verifyDossierHashes,
  verifySereDossier,
  verifySereReproducibility
} = require('./sereVerifier');
const {
  expectedDossierTags,
  renderJuryMarkdown,
  renderJuryHtml,
  renderJuryDocument,
  verifyJuryPresentation
} = require('./sereJuryRenderer');

function assembleSecurityEvidenceReport(input, options = {}) {
  const dossier = assembleSereDossier(input);
  const verification = verifySereDossier(dossier, options);
  if (options.requireVerified !== false && verification.status !== 'verified') {
    const err = failure('SERE_VERIFICATION_FAILED', `SERE verification failed: ${verification.violations.join(', ')}`);
    err.verification = verification;
    err.dossier = dossier;
    throw err;
  }
  const reproducibility = verifySereReproducibility(input, dossier);
  if (!reproducibility.reproducible) {
    throw failure('SERE_NOT_REPRODUCIBLE');
  }
  const juryDocument = renderJuryDocument(dossier, verification);
  const presentationCheck = verifyJuryPresentation(dossier, juryDocument);
  if (!presentationCheck.ok) {
    throw failure('SERE_PRESENTATION_FIDELITY_FAILED');
  }
  const body = {
    schema: BUNDLE_SCHEMA,
    reportId: dossier.reportId,
    dossier,
    verification,
    reproducibility,
    juryDocument,
    presentationCheck,
    authorityModel: AUTHORITY_MODEL,
    promotionEligible: false,
    authorizesPromotion: false,
    requiresExistingPromotionGate: true
  };
  return { ...body, bundleHash: fingerprint(body) };
}

function assembleReportFromRemediationCampaign(input, options = {}) {
  const dossier = fromRemediationCampaign(input);
  const verification = verifySereDossier(dossier, options);
  if (options.requireVerified !== false && verification.status !== 'verified') {
    const err = failure('SERE_VERIFICATION_FAILED', `SERE verification failed: ${verification.violations.join(', ')}`);
    err.verification = verification;
    throw err;
  }
  const juryDocument = renderJuryDocument(dossier, verification);
  const presentationCheck = verifyJuryPresentation(dossier, juryDocument);
  const body = {
    schema: BUNDLE_SCHEMA,
    reportId: dossier.reportId,
    dossier,
    verification,
    reproducibility: {
      reproducible: fromRemediationCampaign(input).dossierHash === dossier.dossierHash,
      expectedDossierHash: dossier.dossierHash,
      rebuiltDossierHash: dossier.dossierHash
    },
    juryDocument,
    presentationCheck,
    authorityModel: AUTHORITY_MODEL,
    promotionEligible: false,
    authorizesPromotion: false,
    requiresExistingPromotionGate: true
  };
  return { ...body, bundleHash: fingerprint(body) };
}

function exportSereBundle(bundle, outputDir) {
  if (!bundle || bundle.schema !== BUNDLE_SCHEMA) {
    throw failure('SERE_BUNDLE_REQUIRED');
  }
  if (!outputDir || typeof outputDir !== 'string') {
    throw failure('SERE_OUTPUT_DIR_REQUIRED');
  }
  fs.mkdirSync(outputDir, { recursive: true });
  const dossierJson = canonicalJson(bundle.dossier);
  const verificationJson = canonicalJson(bundle.verification);
  const presentationMeta = {
    ...bundle.juryDocument,
    markdownFile: 'jury-report.md',
    htmlFile: 'jury-report.html'
  };
  const manifestBody = {
    schema: 'genos.security-evidence-report-manifest/v1',
    reportId: bundle.reportId,
    bundleHash: bundle.bundleHash,
    dossierHash: bundle.dossier.dossierHash,
    verificationHash: bundle.verification.verificationHash,
    presentationHash: bundle.juryDocument.presentationHash,
    authorityModel: AUTHORITY_MODEL,
    files: {
      dossier: { path: 'dossier.json', sha256: computeDigest(dossierJson), authoritative: true },
      verification: { path: 'verification.json', sha256: computeDigest(verificationJson), authoritative: true },
      juryMarkdown: { path: 'jury-report.md', sha256: bundle.juryDocument.markdownDigest, authoritative: false },
      juryHtml: { path: 'jury-report.html', sha256: bundle.juryDocument.htmlDigest, authoritative: false }
    },
    promotionEligible: false
  };
  const manifest = { ...manifestBody, manifestHash: fingerprint(manifestBody) };
  fs.writeFileSync(path.join(outputDir, 'dossier.json'), dossierJson, 'utf8');
  fs.writeFileSync(path.join(outputDir, 'verification.json'), verificationJson, 'utf8');
  fs.writeFileSync(path.join(outputDir, 'presentation.json'), canonicalJson(presentationMeta), 'utf8');
  fs.writeFileSync(path.join(outputDir, 'jury-report.md'), bundle.juryDocument.markdown, 'utf8');
  fs.writeFileSync(path.join(outputDir, 'jury-report.html'), bundle.juryDocument.html, 'utf8');
  fs.writeFileSync(path.join(outputDir, 'manifest.json'), canonicalJson(manifest), 'utf8');
  return { outputDir, manifest };
}

function verifyExportedFiles(outputDir, manifest) {
  const dossierRaw = fs.readFileSync(path.join(outputDir, 'dossier.json'), 'utf8');
  const verificationRaw = fs.readFileSync(path.join(outputDir, 'verification.json'), 'utf8');
  const markdownRaw = fs.readFileSync(path.join(outputDir, 'jury-report.md'), 'utf8');
  const htmlRaw = fs.readFileSync(path.join(outputDir, 'jury-report.html'), 'utf8');
  const fileDigestChecks = [
    computeDigest(dossierRaw) === manifest.files?.dossier?.sha256,
    computeDigest(verificationRaw) === manifest.files?.verification?.sha256,
    computeDigest(markdownRaw) === manifest.files?.juryMarkdown?.sha256,
    computeDigest(htmlRaw) === manifest.files?.juryHtml?.sha256,
    manifest.files?.dossier?.authoritative === true,
    manifest.files?.verification?.authoritative === true,
    manifest.files?.juryMarkdown?.authoritative === false,
    manifest.files?.juryHtml?.authoritative === false
  ];
  if (fileDigestChecks.some((check) => !check)) {
    throw failure('SERE_EXPORTED_FILE_TAMPERED');
  }
  return { dossierRaw, verificationRaw, markdownRaw, htmlRaw };
}

function verifyExportedSereBundle(outputDir) {
  const manifestRaw = fs.readFileSync(path.join(outputDir, 'manifest.json'), 'utf8');
  const manifest = parseCanonical(manifestRaw, 'SERE_MANIFEST_INVALID');
  const manifestCopy = { ...manifest };
  delete manifestCopy.manifestHash;
  if (manifest.manifestHash !== fingerprint(manifestCopy)) {
    throw failure('SERE_MANIFEST_HASH_MISMATCH');
  }
  const { dossierRaw, verificationRaw, markdownRaw, htmlRaw } = verifyExportedFiles(outputDir, manifest);
  const dossier = parseCanonical(dossierRaw, 'SERE_DOSSIER_CANONICAL_INVALID');
  const storedVerification = parseCanonical(verificationRaw, 'SERE_VERIFICATION_CANONICAL_INVALID');
  const recomputedVerification = verifySereDossier(dossier, { verifierId: storedVerification.verifierId });
  if (recomputedVerification.status !== 'verified' || recomputedVerification.verificationHash !== storedVerification.verificationHash) {
    throw failure('SERE_EXPORTED_VERIFICATION_MISMATCH');
  }
  const reconstructedPresentation = renderJuryDocument(dossier, recomputedVerification);
  if (reconstructedPresentation.markdown !== markdownRaw || reconstructedPresentation.html !== htmlRaw) {
    throw failure('SERE_EXPORTED_PRESENTATION_DRIFT');
  }
  const presentationCheck = verifyJuryPresentation(dossier, reconstructedPresentation);
  if (!presentationCheck.ok) {
    throw failure('SERE_EXPORTED_PRESENTATION_INVALID');
  }
  return {
    verified: true,
    reportId: dossier.reportId,
    dossierHash: dossier.dossierHash,
    verificationHash: recomputedVerification.verificationHash,
    manifestHash: manifest.manifestHash
  };
}

module.exports = {
  DOSSIER_SCHEMA,
  VERIFICATION_SCHEMA,
  PRESENTATION_SCHEMA,
  BUNDLE_SCHEMA,
  AUTHORITY_MODEL,
  assembleSereDossier,
  fromRemediationCampaign,
  assertAuthoritativeSource,
  verifyDossierHashes,
  verifySereDossier,
  verifySereReproducibility,
  expectedDossierTags,
  renderJuryMarkdown,
  renderJuryHtml,
  renderJuryDocument,
  verifyJuryPresentation,
  assembleSecurityEvidenceReport,
  assembleReportFromRemediationCampaign,
  exportSereBundle,
  verifyExportedSereBundle
};
