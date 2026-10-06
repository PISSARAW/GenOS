'use strict';

// Historical entry point: validate persistence, runtime evidence and real capsules.
process.exitCode = require('./run_validation_suite').runSuite('garage') ? 0 : 1;
