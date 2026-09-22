'use strict';

/**
 * @file symbiontExecutor.js
 * @description SymbiontExecutor - runs solvers as subprocesses with proper sandboxing.
 */

const { SymbiontRegistry } = require('./symbiontRegistry');

class SymbiontExecutor {
  constructor(options = {}) {
    this.registry = new SymbiontRegistry();
    this.sandbox = options.sandbox || null;
  }

  async execute(solverType, problem, options = {}) {
    const solver = this.registry.get(solverType);
    // Apply options to solver for this execution
    const originalCertification = solver.certificationRequired;
    if (options.certificationRequired !== undefined) {
      solver.certificationRequired = options.certificationRequired;
    }
    try {
      return await solver.run(problem);
    } finally {
      solver.certificationRequired = originalCertification;
    }
  }

  listSolvers() {
    return this.registry.getAll();
  }
}

function createSymbiontExecutor(options) {
  return new SymbiontExecutor(options);
}

module.exports = { SymbiontExecutor, createSymbiontExecutor };