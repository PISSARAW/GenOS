'use strict';

const cases = require('./p0ConsumerCases.cjs');
for (const key of Object.keys(cases)) delete cases[key];
const full = ['test_human_approval_promotion_gate.js', 'test_promotion_execution_recovery.js',
  'test_trajectory_persistence_stdp.js', 'test_stdp_skip_contract.js', 'test_stdp_promotion_resilience.js',
  'test_execution_loop_reconnections.js', 'test_backend.js', 'test_consumer_memory_provenance.js'];
cases.B06 = process.argv[3] === 'memory'
  ? ['test_execution_loop_reconnections.js', 'test_consumer_memory_provenance.js'] : full;
require('./run_p0_consumer_suite.cjs');
