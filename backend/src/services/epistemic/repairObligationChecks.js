'use strict';

const contracts = require('./repairObligationContract');
const { compile } = require('./codeExpressionCompiler');
const { execute } = require('./codeExpressionInterpreter');

function evaluate(expression, obligations, strategy) {
  const tree = compile(expression);
  const ordered = strategy === 'cross_check' ? [...obligations].reverse() : obligations;
  return new Map(ordered.map(obligation => [obligation.id, evaluateObligation(tree, obligation, strategy)]));
}

function evaluateObligation(tree, obligation, strategy) {
  const cases = strategy === 'cross_check' ? [...obligation.cases].reverse() : obligation.cases;
  let failures = 0;
  let invalidOutputs = 0;
  let counterexample = null;
  for (const item of cases) {
    const actual = resultFor(tree, item.input);
    if (actual.error) invalidOutputs += 1;
    if (actual.value === item.expected && !actual.error) continue;
    failures += 1;
    counterexample ||= { input: item.input, expected: item.expected, actual: actual.value, error: actual.error };
  }
  return { checkedCases: cases.length, failures, invalidOutputs, counterexample };
}

function resultFor(tree, input) {
  try { return { value: execute(tree, input), error: null }; }
  catch (error) {
    if (error.code !== 'CODE_EXPRESSION_OUTPUT_INVALID') throw error;
    return { value: null, error: error.code };
  }
}

function outcome(strategy, status, detail) {
  return { schema: contracts.SCHEMA, strategy, status, ...detail };
}

function checkRepair(subject, strategy) {
  try {
    const loaded = contracts.load(subject);
    const binding = contracts.binding(subject);
    const { contract } = subject;
    const candidate = evaluate(loaded.sources.get(contract.artifactPath).content, loaded.suite.obligations, strategy);
    const baseline = evaluate(loaded.sources.get(contract.baselinePath).content, loaded.suite.obligations, strategy);
    const mutants = contract.mutants.map(mutant => evaluateMutant(mutant, loaded.suite.obligations, strategy));
    const obligations = binding.obligations.map(obligation => assess(obligation, { candidate, baseline, mutants }));
    const coverage = { ...binding, obligations, totalMutants: mutants.length,
      checkedMutants: mutants.length, complete: obligations.every(obligation => obligation.status === 'verified') };
    if (obligations.some(obligation => obligation.candidateFailures > 0)) {
      return outcome(strategy, 'refuted', { reason: 'repair_candidate_postcondition_false', coverage });
    }
    if (!coverage.complete) return outcome(strategy, 'inconclusive', { reason: 'repair_test_adequacy_unestablished', coverage });
    return outcome(strategy, 'verified', { reason: 'repair_obligations_demonstrated', coverage });
  } catch (error) {
    return outcome(strategy, 'inconclusive', { reason: error.code || 'repair_input_outside_domain' });
  }
}

function evaluateMutant(mutant, obligations, strategy) {
  const results = evaluate(mutant.expression, obligations, strategy);
  for (const result of results.values()) {
    if (result.invalidOutputs > 0) throw Object.assign(new Error('Mutants must be executable.'), {
      code: 'REPAIR_MUTANT_OUTSIDE_DOMAIN'
    });
  }
  return { ...mutant, results };
}

function assess(obligation, results) {
  const candidate = results.candidate.get(obligation.id);
  const baselineFailures = results.baseline.get(obligation.id).failures;
  const killedMutantIds = results.mutants.filter(mutant => obligation.mutantIds.includes(mutant.id)
    && mutant.results.get(obligation.id).failures > 0).map(mutant => mutant.id).sort();
  const baselineEstablished = obligation.mode === 'regression' ? baselineFailures > 0 : baselineFailures === 0;
  const established = candidate.failures === 0 && baselineEstablished
    && killedMutantIds.length === obligation.mutantIds.length;
  return { ...obligation, status: candidate.failures > 0 ? 'refuted' : (established ? 'verified' : 'inconclusive'),
    checkedCases: candidate.checkedCases, candidateFailures: candidate.failures,
    counterexample: candidate.counterexample, baselineFailures, baselineEstablished, killedMutantIds };
}

module.exports = { checkRepair };
