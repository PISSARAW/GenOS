'use strict';

const values = require('./workspaceOracleValues');
const numerics = require('./workspaceOracleNumerics');
const records = require('./workspaceOracleRecords');
const creative = require('./workspaceOracleCreative');
const STRATEGIES = new Set(['source_recompute', 'cross_check']);
const HANDLERS = { two_machine_partition: numerics.partition, observed_statistics: numerics.statistics,
  literal_logs: records.logs, paired_means: numerics.pairedMeans, json_field_contract: records.jsonContract,
  synthetic_data_quality: records.dataQuality, bar_durations: creative.music, poem_constraints: creative.poem,
  git_numeric_history: records.numericHistory, python_palindrome: require('./workspacePalindromeKernel').verify,
  csv_report_total: records.reportTotal, publication_dossier: dossier };

function outcome(status, reason, strategy) {
  return { schema: 'genos.workspace-postconditions/v1', status, reason, strategy };
}

function checkWorkspace(subject, strategy) {
  if (!STRATEGIES.has(strategy)) return outcome('inconclusive', 'workspace_strategy_unavailable', strategy);
  try {
    require('./workspaceVerificationContract').assertContract(subject.contract);
    const candidate = editable(subject.contract.kind) ? null : values.candidate(subject.report);
    const valid = HANDLERS[subject.contract.kind](subject, strategy, candidate);
    if (!valid) return outcome('refuted', 'workspace_postcondition_false', strategy);
    if (humanReview(subject.contract.kind)) return outcome('inconclusive', 'independent_human_art_review_required', strategy);
    return outcome('verified', 'workspace_postconditions_recomputed', strategy);
  } catch (error) {
    return outcome('inconclusive', error.code || error.message || 'workspace_input_outside_domain', strategy);
  }
}

function editable(kind) { return ['python_palindrome', 'csv_report_total'].includes(kind); }
function humanReview(kind) { return ['poem_constraints', 'publication_dossier'].includes(kind); }
function dossier(subject, strategy, candidate) {
  return numerics.pairedMeans(subject, strategy, candidate)
    && records.jsonContract(subject, strategy, candidate)
    && creative.music(subject, strategy, candidate) && creative.poem(subject, strategy, candidate)
    && values.nonemptyStrings(candidate.limitations);
}

module.exports = { STRATEGIES, checkWorkspace };
