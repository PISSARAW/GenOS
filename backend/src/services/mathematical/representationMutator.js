'use strict';

/**
 * @file representationMutator.js
 * @description RepresentationMutator — mutates representations to find new affordances.
 */

const { conceptId } = require('./conceptMiner');

class RepresentationMutator {
  constructor(opts = {}) {
    this.representations = opts.representations || ['graph', 'algebraic', 'geometric', 'logical', 'SAT', 'SMT'];
  }

  mutateRepresentation(problem) {
    const current = problem.representation || 'standard';
    const alternatives = this.representations.filter(r => r !== current);

    return alternatives.map(rep => ({
      id: conceptId(),
      type: 'representation',
      original: current,
      target: rep,
      transformation: this.getTransformation(current, rep),
      problemId: problem.id,
      createdAt: new Date().toISOString(),
    }));
  }

  getTransformation(from, to) {
    const transformations = {
      'graph->algebraic': 'Adjacency matrix / Laplacian',
      'graph->SAT': 'CNF encoding of graph properties',
      'algebraic->geometric': 'Variety / algebraic set',
      'geometric->logical': 'First-order theory of geometry',
      'logical->SMT': 'SMT-LIB encoding',
      'SAT->SMT': 'Pseudo-boolean to theory',
    };
    return transformations[`${from}->${to}`] || `Custom ${from} to ${to}`;
  }
}

module.exports = { RepresentationMutator };