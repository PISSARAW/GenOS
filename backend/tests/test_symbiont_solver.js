'use strict';

const assert = require('node:assert');
const math = require('../src/services/mathematical');

// Test: SymbiontSolver registry and basic execution
async function testSymbiontSolver() {
  const executor = math.createSymbiontExecutor();

  // List available solvers
  const solvers = executor.listSolvers();
  assert.ok(solvers.includes('SAT'));
  assert.ok(solvers.includes('SMT'));
  assert.ok(solvers.includes('CP-SAT'));
  assert.ok(solvers.includes('ILP'));
  assert.ok(solvers.includes('GRAPH_ISO'));
  assert.ok(solvers.includes('GROEBNER'));

  // Test SAT solver execution (stub)
  const satResult = await executor.execute('SAT', {
    clauses: [[1, -2], [2, 3], [-1, -3]],
    numVars: 3,
  });
  assert.ok(satResult.status === 'SAT' || satResult.status === 'UNSAT');
  assert.ok(satResult.certificate);
  assert.ok(satResult.certificate.verified === true);

  // Test SMT solver execution (stub)
  const smtResult = await executor.execute('SMT', {
    smtlib: '(set-logic QF_LIA)\n(declare-fun x () Int)\n(assert (> x 0))\n(check-sat)\n(exit)',
  });
  assert.ok(smtResult.status === 'sat' || smtResult.status === 'unsat');
  assert.ok(smtResult.certificate);
  assert.ok(smtResult.certificate.verified === true);

  // Test CP-SAT solver execution (stub)
  const cpResult = await executor.execute('CP-SAT', { model: {} });
  assert.ok(cpResult.status === 'OPTIMAL');
  assert.ok(cpResult.certificate);
  assert.ok(cpResult.certificate.verified === true);

  // Test ILP solver execution (stub)
  const ilpResult = await executor.execute('ILP', { mps: '' });
  assert.ok(ilpResult.status === 'OPTIMAL');
  assert.ok(ilpResult.certificate);
  assert.ok(ilpResult.certificate.verified === true);

  // Test Graph ISO solver execution (stub)
  const graphResult = await executor.execute('GRAPH_ISO', { graph6: '' });
  assert.ok(graphResult.status === 'ISOMORPHIC');
  assert.ok(graphResult.certificate);
  assert.ok(graphResult.certificate.verified === true);

  // Test Groebner solver execution (stub)
  const groebnerResult = await executor.execute('GROEBNER', { sageScript: '' });
  assert.ok(groebnerResult.status === 'COMPUTED');
  assert.ok(groebnerResult.certificate);
  assert.ok(groebnerResult.certificate.verified === true);

  console.log('OK SymbiontSolver (all solver types registered and executable)');
}

testSymbiontSolver().catch(e => { console.error(e); process.exit(1); });