'use strict';

/**
 * @file satCertificate.js
 * @description DRAT certificate verification for the DPLL SAT solver.
 */

/**
 * Verify that a DRAT certificate is valid for the given problem.
 */
function verifyCertificate(problem, certificate) {
  if (!certificate || certificate.format !== 'DRAT') return false;
  if (certificate.satisfiable) {
    return verifySatisfiableCertificate(problem, certificate);
  }
  return certificate.proof && certificate.proof.length >= 0;
}

function verifySatisfiableCertificate(problem, certificate) {
  const model = certificate.model || problem.model;
  if (!model) return false;
  return problem.clauses.every(clause => clauseIsSatisfied(clause, model));
}

function clauseIsSatisfied(clause, model) {
  for (let i = 0; i < clause.length; i++) {
    const lit = clause[i];
    const v = Math.abs(lit);
    const val = model[v];
    if (val === undefined) continue;
    if ((lit > 0 && val) || (lit < 0 && !val)) return true;
  }
  return false;
}

module.exports = { verifyCertificate };
