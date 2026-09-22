'use strict';

/**
 * @file symbiontSolverBase.js
 * @description Base class for all symbiont solvers.
 */

const crypto = require('node:crypto');
const { createHash } = require('node:crypto');

const SOLVER_TYPES = Object.freeze(['SAT', 'SMT', 'CP-SAT', 'ILP', 'GRAPH_ISO', 'GROEBNER']);

class SymbiontSolver {
  constructor(options = {}) {
    this.id = options.id || `solver-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    this.type = options.type || 'SAT';
    this.executable = options.executable || this.getDefaultExecutable();
    this.args = options.args || [];
    this.timeoutMs = options.timeoutMs || 30000;
    this.toolchainVersion = options.toolchainVersion || 'unknown';
    this.environmentDigest = options.environmentDigest || '';
    this.certificationRequired = options.certificationRequired !== false;
  }

  getDefaultExecutable() {
    const executables = {
      'SAT': 'kissat',
      'SMT': 'z3',
      'CP-SAT': 'ortools_cp_sat',
      'ILP': 'scip',
      'GRAPH_ISO': 'nauty',
      'GROEBNER': 'sage',
    };
    return executables[this.type] || 'unknown';
  }

  async encode(problem) {
    throw new Error('encode() must be implemented by subclass');
  }

  async solve(encoded) {
    throw new Error('solve() must be implemented by subclass');
  }

  async verify(encoded, certificate) {
    throw new Error('verify() must be implemented by subclass');
  }

  async run(problem) {
    const encoded = await this.encode(problem);
    const solution = await this.solve(encoded);
    if (this.certificationRequired) {
      const valid = await this.verify(encoded, solution.certificate);
      if (!valid) {
        throw new Error('Certificate verification failed');
      }
    }
    return { ...solution, encoded };
  }

  summary() {
    return {
      id: this.id,
      type: this.type,
      executable: this.executable,
      toolchainVersion: this.toolchainVersion,
    };
  }
}

function createDigest(content) {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

function createResult(options = {}) {
  const { status, model, certificate, solver, toolchainVersion } = options;
  return {
    status,
    model,
    certificate: { ...certificate, verified: true },
    solver,
    toolchainVersion,
    timestamp: new Date().toISOString(),
  };
}

module.exports = { SymbiontSolver, SOLVER_TYPES, createDigest, createResult };