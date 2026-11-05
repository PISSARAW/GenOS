'use strict';

const { isDeepStrictEqual } = require('node:util');
const contract = require('../productPowerDifference/contract');
const artifactChecks = require('./oracleWorkerArtifactChecks.cjs');
const STRATEGIES = new Set(['equation_bigint_power', 'equation_repeated_addition']);

function result(status, reason, strategy) {
  return { schema: 'genos.product-power-difference-oracle/v1', status, reason, strategy };
}

function validSubject(subject) {
  if (subject?.domain !== contract.DOMAIN || !contract.premisesValid(subject.method?.parameters?.premises)) return false;
  const source = subject.result?.source;
  try {
    return isDeepStrictEqual(source.methodContract, subject.method)
      && isDeepStrictEqual(contract.parse(source.report), subject.result.candidate)
      && [...artifactChecks.STRATEGIES].every(strategy =>
        artifactChecks.verify({ content: source }, strategy).status === 'verified');
  } catch { return false; }
}

function addProduct(left, right) {
  let total = 0n;
  for (let index = 0; index < right; index += 1) total += left;
  return total;
}

function recompute(premises, strategy) {
  const { A, B, C, D, E } = premises;
  if (strategy === 'equation_bigint_power') return BigInt(A) * BigInt(B) + BigInt(C) ** BigInt(D) - BigInt(E);
  let power = 1n;
  for (let exponent = 0; exponent < D; exponent += 1) power = addProduct(power, C);
  return addProduct(BigInt(A), B) + power - BigInt(E);
}

function check(subject, strategy) {
  if (!STRATEGIES.has(strategy)) return result('inconclusive', 'equation_strategy_unavailable', strategy);
  if (!validSubject(subject)) return result('refuted', 'equation_subject_invalid', strategy);
  const premises = subject.method.parameters.premises;
  const candidate = subject.result.candidate;
  const bound = contract.KEYS.every(key => candidate[key] === premises[key]);
  const expected = recompute(premises, strategy);
  const verified = bound && expected > 0n && expected === BigInt(candidate.N);
  return result(verified ? 'verified' : 'refuted',
    verified ? 'sealed_equation_independently_recomputed' : 'equation_candidate_false', strategy);
}

module.exports = { STRATEGIES, check };
