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

  // Test SAT solver execution (mock - certification disabled for mock)
  const satResult = await executor.execute('SAT', {
    clauses: [[1, -2], [2, 3], [-1, -3]],
    numVars: 3,
  }, { certificationRequired: false });
  assert.ok(satResult.status === 'SAT' || satResult.status === 'UNSAT');
  assert.ok(satResult.certificate);
  // Mock solvers have verified: false until real certificate verification is implemented

  // Test SMT solver execution (mock)
  const smtResult = await executor.execute('SMT', {
    smtlib: '(set-logic QF_LIA)\n(declare-fun x () Int)\n(assert (> x 0))\n(check-sat)\n(exit)',
  }, { certificationRequired: false });
  assert.ok(smtResult.status === 'sat' || smtResult.status === 'unsat');
  assert.ok(smtResult.certificate);

  // Test CP-SAT solver execution (mock)
  const cpResult = await executor.execute('CP-SAT', { model: {} }, { certificationRequired: false });
  assert.ok(cpResult.status === 'OPTIMAL');
  assert.ok(cpResult.certificate);

  // Test ILP solver execution (mock)
  const ilpResult = await executor.execute('ILP', { mps: '' }, { certificationRequired: false });
  assert.ok(ilpResult.status === 'OPTIMAL');
  assert.ok(ilpResult.certificate);

  // Test Graph ISO solver execution (mock)
  const graphResult = await executor.execute('GRAPH_ISO', { graph6: '' }, { certificationRequired: false });
  assert.ok(graphResult.status === 'ISOMORPHIC');
  assert.ok(graphResult.certificate);

  // Test Groebner solver execution (mock)
  const groebnerResult = await executor.execute('GROEBNER', { sageScript: '' }, { certificationRequired: false });
  assert.ok(groebnerResult.status === 'COMPUTED');
  assert.ok(groebnerResult.certificate);

  console.log('OK SymbiontSolver (all solver types registered and executable as mocks)');
}

testSymbiontSolver().catch(e => { console.error(e); process.exit(1); });