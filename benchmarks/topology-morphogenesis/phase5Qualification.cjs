'use strict';

const { evaluatePairedCampaign } = require('./../../backend/src/services/morphogenesis/synthesis/pairedCampaignGate');

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function summarizeGroup(conditionId, taskFamily, rows) {
  return {
    conditionId,
    taskFamily,
    attemptCount: rows.length,
    verifiedCount: rows.filter(row => row.oracleVerified === true && row.executionVerified === true).length,
    failureCount: rows.filter(row => row.oracleVerified !== true || row.executionVerified !== true).length,
    meanScore: mean(rows.map(row => Number(row.score)).filter(Number.isFinite)),
    meanCost: mean(rows.map(row => Number(row.cost)).filter(Number.isFinite)),
    budgetExceededCount: rows.filter(row => row.budgetExceeded === true).length
  };
}

function summarizeRows(rows) {
  const groups = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = `${row.conditionId}::${row.taskFamily || 'unknown'}`;
    if (!groups.has(key)) groups.set(key, { conditionId: row.conditionId, taskFamily: row.taskFamily || 'unknown', rows: [] });
    groups.get(key).rows.push(row);
  }
  return [...groups.values()].map(group => summarizeGroup(group.conditionId, group.taskFamily, group.rows));
}

function summarizeConditions(rows) {
  const groups = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!groups.has(row.conditionId)) groups.set(row.conditionId, []);
    groups.get(row.conditionId).push(row);
  }
  return [...groups.entries()].map(([conditionId, groupRows]) => summarizeGroup(conditionId, null, groupRows));
}

function summarizeGlobal(rows) {
  return summarizeGroup('all', null, Array.isArray(rows) ? rows : []);
}

function blockers(input, gate) {
  const required = [
    ['holdout_phase_required', input.phase === 'holdout'],
    ['source_tree_dirty', input.sourceClean === true],
    ['external_adapters_unverified', input.externalAdaptersVerified === true],
    ['mechanism_evidence_unverified', input.mechanismEvidenceVerified === true],
    ['train_holdout_separation_unverified', input.trainHoldoutDisjoint === true],
    ['confirmatory_repetitions_incomplete', Number(input.performedRepetitions) >= Number(input.requiredRepetitions)],
    ['paired_campaign_gate_blocked', gate.status === 'eligible']
  ];
  return required.filter(([, passed]) => !passed).map(([reason]) => reason);
}

function qualifyConfirmatoryCampaign(input = {}) {
  const rows = Array.isArray(input.observations) ? input.observations : [];
  const gate = evaluatePairedCampaign({ manifest: input.manifest, observations: rows });
  const reportBlockers = blockers(input, gate);
  const qualified = reportBlockers.length === 0;
  return {
    schema: 'genos.morphogenesis.phase5-qualification/v1',
    status: qualified ? 'qualified' : 'blocked',
    scope: { phase: input.phase || null, campaignId: input.manifest?.campaignId || null,
      modelId: input.manifest?.execution?.modelId || null, taskFamilies: [...new Set(rows.map(row => row.taskFamily).filter(Boolean))] },
    gate,
    summary: summarizeRows(rows),
    conditionSummary: summarizeConditions(rows),
    globalSummary: summarizeGlobal(rows),
    repetitions: { required: Number(input.requiredRepetitions) || null, performed: Number(input.performedRepetitions) || 0 },
    blockers: reportBlockers,
    causalAdvantage: qualified && gate.adaptiveCommitEligible === true,
    universalGeneralization: false,
    runtimePromotionAuthorized: false,
    caveat: 'Qualification is limited to the observed campaign scope and does not establish universal superiority.'
  };
}

module.exports = { summarizeRows, summarizeConditions, summarizeGlobal, qualifyConfirmatoryCampaign };
