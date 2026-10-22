#!/usr/bin/env node
'use strict';

/**
 * CLI de verification claim-to-evidence (Chantier 5).
 */

const { verifyCorpus } = require('./claimEvidenceVerifier');

function parseArgs(argv) {
  const args = { corpus: null, evidence: null, json: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--corpus') args.corpus = argv[i + 1] ?? null;
    if (arg === '--evidence') args.evidence = argv[i + 1] ?? null;
    if (arg === '--json') args.json = true;
    if (arg === '--help' || arg === '-h') args.help = true;
  }
  return args;
}

function formatClaimLine(claim) {
  const mark = claim.status === 'verified' ? 'OK' : 'MANQUANT';
  const lines = [`  [${mark}] ${claim.claimId} : ${claim.statement}`];
  for (const ref of claim.evidenceMissing) lines.push(`      preuve manquante : ${ref}`);
  for (const ref of claim.evidenceFound) lines.push(`      preuve trouvee : ${ref}`);
  if (!claim.evidenceAttached) lines.push('      aucune preuve attachee au claim');
  return lines.join('\n');
}

function formatResult(result) {
  if (result.error) return `Rapport : ${result.report}\n  ERREUR : ${result.error}`;
  const header = [
    `Rapport : ${result.report}`,
    `  claims totaux : ${result.claimCount}`,
    `  claims verifies : ${result.verifiedCount}`,
    `  claims avec preuve manquante/partielle : ${result.missingEvidenceCount}`,
    `  falacieux detects : ${result.fallacies.length}`,
  ];
  const claimLines = result.claims.map(formatClaimLine);
  const fallacyLines = result.fallacies.map((f) => `  FALACIE : ${f.type} - ${f.description}`);
  return [...header, ...claimLines, ...fallacyLines, `  statut global : ${result.overallStatus}`].join('\n');
}

function printHumanSummary(summary) {
  console.log('=== Verification claim-to-evidence (Chantier 5) ===');
  console.log(`Corpus : ${summary.corpusDir}`);
  console.log(`Magasin de preuves : ${summary.evidenceDir}`);
  console.log(`Rapports : ${summary.reportCount} | Claims : ${summary.totalClaims} | Verifies : ${summary.totalVerified}`);
  for (const result of summary.results) {
    console.log(formatResult(result));
    console.log('');
  }
  const label = summary.allVerified ? 'TOUS VERIFIES' : 'ECHEC OU PARTIEL';
  console.log(`=== Statut global : ${label} ===`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node scripts/claim-to-evidence/cli.cjs --corpus <dir> --evidence <dir> [--json]');
    return 0;
  }
  if (!args.corpus || !args.evidence) {
    console.error('ERREUR : --corpus et --evidence sont obligatoires.');
    return 1;
  }
  const summary = verifyCorpus(args.corpus, args.evidence);
  if (args.json) console.log(JSON.stringify(summary, null, 2));
  else printHumanSummary(summary);
  return summary.allVerified ? 0 : 1;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = { parseArgs, formatResult, main };
