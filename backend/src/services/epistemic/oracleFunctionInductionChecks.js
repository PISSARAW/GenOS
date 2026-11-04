'use strict';

const contract = require('../functionInduction/contract');
const mathematics = require('../functionInduction/mathematics');
const artifactChecks = require('./oracleWorkerArtifactChecks.cjs');
const {isDeepStrictEqual} = require('node:util');
const STRATEGIES = new Set(['function_public_samples', 'function_identifiability']);

function result(status, reason, strategy) {
  return {schema: 'genos.native-function-induction-oracle/v1', status, reason, strategy};
}

function artifactValid(source) {
  const subject = {content: source};
  return [...artifactChecks.STRATEGIES].every(strategy => artifactChecks.verify(subject, strategy).status === 'verified');
}

function inputValid(subject) {
  return subject?.domain === contract.DOMAIN && contract.contextValid(subject.method?.parameters?.context)
    && contract.declarationsValid(subject.result?.rules, subject.method.parameters.context.requested)
    && artifactValid(subject.result.source) && boundResult(subject);
}

function boundResult(subject) {
  try {
    return isDeepStrictEqual(contract.parse(subject.result.source.report), subject.result.rules)
      && isDeepStrictEqual(subject.method, subject.result.source.methodContract);
  } catch {return false;}
}

function declarationHolds(rule, context, strategy) {
  const samples = context.observations.filter(row => contract.key(row) === contract.key(rule));
  if (strategy === 'function_identifiability') return rule.reason === mathematics.identifiability(samples);
  return rule.reason !== 'answerable' || mathematics.matches(rule, samples);
}

function check(subject, strategy) {
  if (!STRATEGIES.has(strategy)) return result('inconclusive', 'function_strategy_unavailable', strategy);
  if (!inputValid(subject)) return result('refuted', 'function_subject_or_declarations_invalid', strategy);
  const context = subject.method.parameters.context;
  const accepted = subject.result.rules.every(rule => declarationHolds(rule, context, strategy));
  return result(accepted ? 'verified' : 'refuted',
    accepted ? 'public_function_postconditions_verified' : 'public_function_postcondition_false', strategy);
}

module.exports = {STRATEGIES, check};
