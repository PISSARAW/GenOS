'use strict';

function matches(condition, facts) {
  if (!condition || typeof condition !== 'object' || Array.isArray(condition)) throw new Error('STRUCTURED_APPLICABILITY_REQUIRED');
  return Object.entries(condition).every(([key, value]) => Object.hasOwn(facts, key) && facts[key] === value);
}

function decide(model, sample) {
  if (sample.environmentVersion !== model.environmentVersion) return 'ABSTAIN';
  if (!model.conditions.every((condition) => matches(condition, sample.facts))) return 'ABSTAIN';
  if (model.counterexamples.some((condition) => matches(condition, sample.facts))) return 'ABSTAIN';
  const rules = model.procedure?.rules;
  if (!Array.isArray(rules) || !rules.length) throw new Error('DECLARATIVE_PROCEDURE_REQUIRED');
  const rule = rules.find((item) => matches(item.when, sample.facts));
  return rule ? String(rule.decision) : 'ABSTAIN';
}

function compare(input) {
  if (!input.samples.length || input.samples.length > 10000) throw new Error('BOUNDED_REPLAY_CASES_REQUIRED');
  const cases = input.samples.map((sample) => ({
    caseId: sample.caseId, before: decide(input.before, sample), after: decide(input.after, sample)
  }));
  return { preserved: cases.every((item) => item.before === item.after), cases };
}

module.exports = { matches, decide, compare };
