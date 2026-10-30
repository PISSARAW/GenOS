'use strict';

// Bounded tactics. Unsupported research strategies require a proof producer.
const TACTICS = Object.freeze({
  simp: '  simp',
  normalization: '  intros\n  rfl',
  contradiction: '  intro h\n  contradiction',
  induction: '  intro n\n  induction n <;> simp_all',
  omega: '  omega',
  ring: '  ring',
  linarith: '  linarith',
  existing_theorem_retrieval: '  exact?',
});

function proofBodyFor(attempt) {
  if (typeof attempt.proofBody === 'string' && attempt.proofBody.trim()) return attempt.proofBody;
  return TACTICS[attempt.strategy] || null;
}

module.exports = { proofBodyFor };
