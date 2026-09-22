'use strict';

/**
 * @file symbiontRegistry.js
 * @description Registry of available symbiont solvers.
 */

const { SATSolver, SMTSolver, CPSATSolver, ILPSolver, GraphISOSolver, GroebnerSolver } = require('./symbiontSolvers');

class SymbiontRegistry {
  constructor() {
    this.solvers = new Map();
    this.registerDefaults();
  }

  registerDefaults() {
    this.register('SAT', () => new SATSolver());
    this.register('SMT', () => new SMTSolver());
    this.register('CP-SAT', () => new CPSATSolver());
    this.register('ILP', () => new ILPSolver());
    this.register('GRAPH_ISO', () => new GraphISOSolver());
    this.register('GROEBNER', () => new GroebnerSolver());
  }

  register(type, factory) {
    this.solvers.set(type, factory);
  }

  get(type) {
    const factory = this.solvers.get(type);
    if (!factory) {
      throw new Error(`No solver registered for type: ${type}`);
    }
    return factory();
  }

  getAll() {
    return Array.from(this.solvers.keys());
  }
}

module.exports = { SymbiontRegistry };