'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const token = argv.find((value) => value.startsWith('--campaign='));
  if (!token || argv.length !== 1) throw coded('Usage: node score.cjs --campaign=<campaign.json>', 'REFLECTION_CAMPAIGN_REQUIRED');
  return path.resolve(token.slice('--campaign='.length));
}

function digestFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function loadRecords(campaignPath, campaign) {
  const directory = path.join(path.dirname(campaignPath), 'run-records');
  return campaign.runs.map((planned) => {
    const filePath = path.join(directory, `${planned.runId}.json`);
    if (!fs.existsSync(filePath)) throw coded(`Enregistrement absent: ${planned.runId}`, 'REFLECTION_RECORD_MISSING');
    const record = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    validatePlanBinding(planned, record);
    return record;
  });
}

function validatePlanBinding(planned, record) {
  const keys = ['runId', 'pairId', 'replicate', 'mode', 'missionId', 'variantId'];
  const changed = keys.find((key) => record[key] !== planned[key]);
  if (changed) throw coded(`Fiche détachée du plan (${changed}): ${planned.runId}`, 'REFLECTION_PLAN_BINDING_INVALID');
  if (JSON.stringify(record.budget) !== JSON.stringify(planned.budget)) {
    throw coded(`Budget modifié: ${planned.runId}`, 'REFLECTION_BUDGET_CHANGED');
  }
}

function validateRecord(record, campaignDir) {
  if (record.status !== 'completed') throw coded(`Essai non terminé: ${record.runId}`, 'REFLECTION_RUN_INCOMPLETE');
  if (typeof record.outcome?.taskSucceeded !== 'boolean' || typeof record.outcome?.evidenceValid !== 'boolean') {
    throw coded(`Verdict incomplet: ${record.runId}`, 'REFLECTION_OUTCOME_INCOMPLETE');
  }
  requireNumber(record.metrics.wallTimeMs, record.runId, 'wallTimeMs');
  requireNumber(record.metrics.humanInterventions, record.runId, 'humanInterventions');
  validateMissionMetrics(record);
  validateEvidenceSet(record, campaignDir);
}

function validateMissionMetrics(record) {
  if (record.missionId === 'budget') requireNumber(record.metrics.tokens, record.runId, 'tokens');
  if (record.missionId === 'branches') requireNumber(record.metrics.iterations, record.runId, 'iterations');
  if (record.missionId === 'evidence-gate') validatePromotion(record);
}

function validateEvidenceSet(record, campaignDir) {
  if (!Array.isArray(record.evidence) || !record.evidence.length) throw coded(`Preuve absente: ${record.runId}`, 'REFLECTION_EVIDENCE_MISSING');
  if (!Array.isArray(record.verifierReceipts) || !record.verifierReceipts.length) throw coded(`Reçu vérificateur absent: ${record.runId}`, 'REFLECTION_RECEIPT_MISSING');
  for (const evidence of record.evidence) validateEvidence(evidence, campaignDir, record.runId);
}

function validatePromotion(record) {
  const valid = ['PROMOTE', 'REJECT', 'REVISE', 'ESCALATE'];
  if (!record.promotionDecision || !valid.includes(record.promotionDecision.status)) {
    throw coded(`Décision de promotion absente: ${record.runId}`, 'REFLECTION_PROMOTION_MISSING');
  }
}

function validateEvidence(evidence, campaignDir, runId) {
  if (!evidence || typeof evidence.path !== 'string' || !/^[a-f0-9]{64}$/.test(evidence.sha256 || '')) {
    throw coded(`Référence de preuve invalide: ${runId}`, 'REFLECTION_EVIDENCE_INVALID');
  }
  const resolved = path.resolve(campaignDir, evidence.path);
  const relative = path.relative(campaignDir, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw coded(`Preuve hors campagne: ${runId}`, 'REFLECTION_EVIDENCE_ESCAPE');
  if (!fs.existsSync(resolved) || digestFile(resolved) !== evidence.sha256) throw coded(`Empreinte de preuve invalide: ${runId}`, 'REFLECTION_EVIDENCE_DIGEST');
}

function requireNumber(value, runId, field) {
  if (!Number.isFinite(value) || value < 0) throw coded(`Métrique ${field} absente: ${runId}`, 'REFLECTION_METRIC_MISSING');
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function summarize(records, mode) {
  const selected = records.filter((record) => record.mode === mode);
  const verified = selected.filter((record) => record.outcome.taskSucceeded && record.outcome.evidenceValid);
  const budgetRuns = selected.filter((record) => record.missionId === 'budget');
  const gateRuns = selected.filter((record) => record.missionId === 'evidence-gate');
  return {
    sampleCount: selected.length,
    verifiedSuccessRate: verified.length / selected.length,
    meanWallTimeMs: mean(selected.map((record) => record.metrics.wallTimeMs)),
    meanHumanInterventions: mean(selected.map((record) => record.metrics.humanInterventions)),
    budgetComplianceRate: mean(budgetRuns.map((record) => Number(record.metrics.tokens <= record.budget.tokens))),
    unsupportedPromotionRate: mean(gateRuns.map((record) => Number(record.promotionDecision.status === 'PROMOTE')))
  };
}

function pairedDeltas(records) {
  const pairs = new Map();
  for (const record of records) {
    const pair = pairs.get(record.pairId) || {};
    pair[record.mode] = record;
    pairs.set(record.pairId, pair);
  }
  return [...pairs.entries()].map(([pairId, pair]) => ({
    pairId,
    wallTimeDeltaMs: pair.genos.metrics.wallTimeMs - pair.alone.metrics.wallTimeMs,
    humanInterventionDelta: pair.genos.metrics.humanInterventions - pair.alone.metrics.humanInterventions,
    verifiedSuccessDelta: Number(pair.genos.outcome.taskSucceeded && pair.genos.outcome.evidenceValid)
      - Number(pair.alone.outcome.taskSucceeded && pair.alone.outcome.evidenceValid)
  }));
}

function buildReport(campaign, records) {
  return {
    schemaVersion: 1, protocolId: campaign.protocolId, protocolDigest: campaign.protocolDigest,
    generatedAt: new Date().toISOString(), confirmatoryEligible: campaign.confirmatoryEligible,
    status: campaign.confirmatoryEligible ? 'complete' : 'exploratory-dirty-worktree',
    summaries: { alone: summarize(records, 'alone'), genos: summarize(records, 'genos') },
    pairedDeltas: pairedDeltas(records), limitations: [
      'Deux répétitions par mission constituent un pilote, pas une conclusion générale.',
      'Les variantes sont croisées mais différentes au sein d’une paire; un effet de difficulté résiduel reste possible.',
      'Les reçus et empreintes prouvent la présence des artefacts, pas la vérité de toutes les affirmations.'
    ]
  };
}

function scoreCampaign(campaignPath) {
  const campaign = JSON.parse(fs.readFileSync(campaignPath, 'utf8'));
  const campaignDir = path.dirname(campaignPath);
  const records = loadRecords(campaignPath, campaign);
  for (const record of records) validateRecord(record, campaignDir);
  return buildReport(campaign, records);
}

function coded(message, code) {
  return Object.assign(new Error(message), { code });
}

function main() {
  const campaignPath = parseArgs(process.argv.slice(2));
  const report = scoreCampaign(campaignPath);
  const outPath = path.join(path.dirname(campaignPath), 'report.json');
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Rapport: ${outPath}`);
  console.log(`Statut: ${report.status}`);
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(`${error.code || 'REFLECTION_SCORE_FAILED'}: ${error.message}`); process.exit(1); }
}

module.exports = { buildReport, scoreCampaign, validateRecord };
