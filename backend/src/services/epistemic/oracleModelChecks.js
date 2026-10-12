'use strict';

const { checkSubset } = require('./oracleSubsetChecks');
const { createHash } = require('node:crypto');
const STRATEGIES = new Set(['subset_bitset', 'subset_enumeration']);
function digestText(text) {
  return `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
}

function checkModel(subject, strategy) {
  if (!STRATEGIES.has(strategy) || subject?.method?.methodId !== 'subset_sum') {
    return { status: 'inconclusive', reason: 'model_oracle_domain_unavailable', strategy };
  }
  const output = subject.modelOutput;
  if (output?.encoding !== 'utf8-raw-text' || typeof output.text !== 'string'
      || output.digest !== digestText(output.text)) {
    return { status: 'refuted', reason: 'model_output_digest_mismatch', strategy };
  }
  let result;
  try { result = JSON.parse(output.text); }
  catch (_) { return { status: 'refuted', reason: 'model_output_not_json', strategy }; }
  const checked = checkSubset({ method: subject.method, result }, strategy);
  return { ...checked, strategy };
}

module.exports = { STRATEGIES, checkModel };
