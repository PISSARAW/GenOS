'use strict';

/**
 * @file conceptogenesisService.js
 * @description Conceptogenesis — the capacity to invent new mathematical concepts.
 */

const { ConceptMiner, conceptId } = require('./conceptMiner');
const { AbstractionFormer } = require('./abstractionFormer');
const { RepresentationMutator } = require('./representationMutator');
const { CompressionEvaluator } = require('./compressionEvaluator');
const { TransferTester } = require('./transferTester');

const CONCEPT_TYPES = Object.freeze(['invariant', 'abstraction', 'structure', 'representation', 'heuristic']);

class ConceptogenesisEngine {
  constructor(opts = {}) {
    this.miner = new ConceptMiner(opts.miner);
    this.abstractionFormer = new AbstractionFormer(opts.abstraction);
    this.representationMutator = new RepresentationMutator(opts.representation);
    this.compressionEvaluator = new CompressionEvaluator();
    this.transferTester = new TransferTester();
    this.concepts = new Map();
    this.history = [];
  }

  async inventConcepts(observations, options = {}) {
    const invariants = this.miner.mineInvariants(observations);

    const abstractions = [];
    for (const inv of invariants) {
      const abs = this.abstractionFormer.formAbstraction(inv.evidence || []);
      if (abs) abstractions.push(abs);
    }

    const representations = [];
    if (options.problem) {
      representations.push(...this.representationMutator.mutateRepresentation(options.problem));
    }

    const evaluated = [];
    for (const concept of [...invariants, ...abstractions, ...representations]) {
      const evalResult = this.compressionEvaluator.evaluate(concept, observations);
      if (evalResult.isUseful) {
        evaluated.push({ ...concept, compression: evalResult });
      }
    }

    if (options.targetDomain) {
      for (const concept of evaluated) {
        const transfer = await this.transferTester.testTransfer(
          concept,
          options.targetDomain,
          options.testCases || []
        );
        concept.transfer = transfer;
      }
    }

    for (const concept of evaluated) {
      this.concepts.set(concept.id, concept);
    }

    this.history.push({
      timestamp: new Date().toISOString(),
      observationsCount: observations.length,
      conceptsGenerated: evaluated.length,
    });

    return evaluated;
  }

  getConcept(id) {
    return this.concepts.get(id);
  }

  summary() {
    return {
      concepts: this.concepts.size,
      historyLength: this.history.length,
    };
  }
}

function createConceptogenesisEngine(options) {
  return new ConceptogenesisEngine(options);
}

module.exports = {
  ConceptogenesisEngine,
  createConceptogenesisEngine,
  ConceptMiner,
  AbstractionFormer,
  RepresentationMutator,
  CompressionEvaluator,
  TransferTester,
  CONCEPT_TYPES,
  conceptId,
};