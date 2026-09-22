'use strict';

/**
 * @file symbiontSolver.js
 * @description Symbiont Solver Interface — abstract interface for exact mathematical solvers
 * (SAT, SMT, CP-SAT, ILP, etc.) that act as "symbionts" in the Mathematical Organism.
 */

const { SymbiontSolver, SOLVER_TYPES } = require('./symbiontSolverBase');
const { SATSolver, SMTSolver, CPSATSolver, ILPSolver, GraphISOSolver, GroebnerSolver } = require('./symbiontSolvers');
const { SymbiontRegistry } = require('./symbiontRegistry');
const { SymbiontExecutor, createSymbiontExecutor } = require('./symbiontExecutor');

module.exports = {
  SymbiontSolver,
  SATSolver,
  SMTSolver,
  CPSATSolver,
  ILPSolver,
  GraphISOSolver,
  GroebnerSolver,
  SymbiontRegistry,
  SymbiontExecutor,
  createSymbiontExecutor,
  SOLVER_TYPES,
};