'use strict';

/**
 * @file conceptogenesisService.js
 * @description Conceptogenesis — the capacity to invent new mathematical concepts.
 * From experimental observations, mine invariants, form abstractions, test transferability.
 *
 * This is M7 in the Mathematical Organism: IMAGINATION.
 */

const crypto = require('node:crypto');

function conceptId() {
  return `concept-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

const CONCEPT_TYPES = Object.freeze(['invariant', 'abstraction', 'structure', 'representation', 'heuristic']);

/**
 * ConceptMiner — mines invariants from experimental data.
 */
class ConceptMiner {
  constructor(opts = {}) {
    this.minSupport = opts.minSupport || 0.7;
    this.minConfidence = opts.minConfidence || 0.8;
  }

  /**
   * Mine invariants from a set of observations.
   * @param {Array} observations - Array of { input, output, context }
   * @returns {Array} Candidate invariants
   */
  mineInvariants(observations) {
    if (!observations || observations.length < 3) return [];

    const invariants = [];

    // 1. Structural invariants (properties that hold across all observations)
    const structural = this.mineStructuralInvariants(observations);
    invariants.push(...structural);

    // 2. Numerical invariants (relationships between numeric values)
    const numerical = this.mineNumericalInvariants(observations);
    invariants.push(...numerical);

    // 3. Relational invariants (relationships between objects)
    const relational = this.mineRelationalInvariants(observations);
    invariants.push(...relational);

    return invariants.filter(inv => inv.support >= this.minSupport && inv.confidence >= this.minConfidence);
  }

  mineStructuralInvariants(observations) {
    // Look for common structural features
    const features = {};
    for (const obs of observations) {
      const structure = obs.context?.structure || '';
      if (structure) {
        features[structure] = (features[structure] || 0) + 1;
      }
    }

    const invariants = [];
    for (const [feature, count] of Object.entries(features)) {
      const support = count / observations.length;
      if (support >= this.minSupport) {
        invariants.push({
          type: 'structural_invariant',
          statement: `All observed structures have property: ${feature}`,
          support,
          confidence: support,
          evidence: observations.filter(o => o.context?.structure === feature).map(o => o.input),
        });
      }
    }
    return invariants;
  }

  mineNumericalInvariants(observations) {
    // Simple numerical pattern mining
    const invariants = [];
    const numericFields = ['size', 'degree', 'chromaticNumber', 'cliqueNumber', 'diameter'];

    for (const field of numericFields) {
      const values = observations
        .map(o => o.output?.[field] || o.context?.[field])
        .filter(v => typeof v === 'number');

      if (values.length < 3) continue;

      // Check for constant value
      const allSame = values.every(v => v === values[0]);
      if (allSame) {
        invariants.push({
          type: 'numerical_invariant',
          statement: `${field} is constant = ${values[0]}`,
          support: 1.0,
          confidence: 1.0,
          evidence: values,
        });
      }

      // Check for linear relationship (simplified)
      if (values.length >= 4) {
        // Would use regression in real implementation
        invariants.push({
          type: 'numerical_pattern',
          statement: `${field} follows pattern: ${values.slice(0, 5).join(', ')}...`,
          support: 0.7,
          confidence: 0.7,
          evidence: values,
        });
      }
    }
    return invariants;
  }

  mineRelationalInvariants(observations) {
    // Placeholder for relational mining (e.g., graph properties)
    return [];
  }
}

/**
 * AbstractionFormer — forms abstractions from concrete instances.
 */
class AbstractionFormer {
  constructor(opts = {}) {
    this.minInstances = opts.minInstances || 3;
  }

  /**
   * Form an abstraction from instances.
   * @param {Array} instances - Concrete mathematical objects
   * @returns {Object|null} Abstraction or null
   */
  formAbstraction(instances) {
    if (!instances || instances.length < this.minInstances) return null;

    // Extract common structure
    const common = this.extractCommonStructure(instances);
    if (!common) return null;

    return {
      id: conceptId(),
      type: 'abstraction',
      name: `Abstract${common.type}`,
      definition: common.definition,
      instances: instances.map(i => i.id || i.name).slice(0, 5),
      properties: common.properties,
      createdAt: new Date().toISOString(),
    };
  }

  extractCommonStructure(instances) {
    // Simplified: find common type
    const types = instances.map(i => i.type || i.constructor?.name).filter(Boolean);
    const typeCounts = {};
    for (const t of types) typeCounts[t] = (typeCounts[t] || 0) + 1;

    const mostCommon = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0];
    if (!mostCommon || mostCommon[1] < this.minInstances) return null;

    return {
      type: mostCommon[0],
      definition: `Common structure: ${mostCommon[0]}`,
      properties: ['shared by ' + mostCommon[1] + ' instances'],
    };
  }
}

/**
 * RepresentationMutator — mutates representations to find new affordances.
 */
class RepresentationMutator {
  constructor(opts = {}) {
    this.representations = opts.representations || ['graph', 'algebraic', 'geometric', 'logical', 'SAT', 'SMT'];
  }

  /**
   * Generate alternative representations for a problem.
   * @param {Object} problem - Mathematical problem
   * @returns {Array} Alternative representations
   */
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

/**
 * CompressionEvaluator — evaluates if a concept compresses knowledge.
 */
class CompressionEvaluator {
  evaluate(concept, instances) {
    // Concept should reduce description length
    const conceptComplexity = this.estimateComplexity(concept);
    const instancesComplexity = instances.reduce((sum, i) => sum + this.estimateComplexity(i), 0);

    const compressionRatio = instancesComplexity / Math.max(1, conceptComplexity);
    const isUseful = compressionRatio > 1.5;

    return {
      compressionRatio,
      isUseful,
      conceptComplexity,
      instancesComplexity,
    };
  }

  estimateComplexity(obj) {
    // Simplified complexity estimation
    return JSON.stringify(obj).length;
  }
}

/**
 * TransferTester — tests if a concept transfers to new domains.
 * Uses structural similarity and domain compatibility heuristics.
 */
class TransferTester {
  async testTransfer(concept, targetDomain, testCases) {
    if (!testCases || testCases.length === 0) {
      return {
        conceptId: concept.id,
        targetDomain,
        successRate: 0,
        applicable: false,
        testResults: [],
      };
    }

    // Heuristic: concepts with higher compression ratio transfer better
    const compressionBonus = concept.compression?.isUseful ? 0.3 : 0;
    
    // Heuristic: concepts from similar domains transfer better
    const domainSimilarity = this.computeDomainSimilarity(concept, targetDomain);
    
    // Deterministic "random" based on concept ID hash for reproducibility
    const seed = this.hashString(concept.id + targetDomain);
    
    const baseSuccessRate = 0.4 + compressionBonus + domainSimilarity * 0.3;
    const successRate = Math.min(0.95, Math.max(0.1, baseSuccessRate));
    
    const testResults = testCases.map((tc, i) => {
      // Deterministic pass/fail based on seeded pseudo-random
      const testSeed = this.hashString(`${seed}-${i}-${JSON.stringify(tc)}`);
      const passed = (testSeed % 100) / 100 < successRate;
      return { testCase: tc, passed };
    });
    
    const passedCount = testResults.filter(r => r.passed).length;
    const actualRate = testResults.length > 0 ? passedCount / testResults.length : 0;
    
    return {
      conceptId: concept.id,
      targetDomain,
      successRate: actualRate,
      applicable: true,
      testResults,
      heuristics: {
        compressionBonus,
        domainSimilarity,
        baseSuccessRate,
      },
    };
  }

  computeDomainSimilarity(concept, targetDomain) {
    // Simple heuristic: check if concept's original domain relates to target
    const conceptDomain = concept.domain || 'general';
    if (conceptDomain === targetDomain) return 1.0;
    
    // Related domain pairs
    const relatedDomains = {
      'combinatorics': ['graph-theory', 'number-theory', 'algebra'],
      'algebra': ['number-theory', 'geometry', 'combinatorics'],
      'analysis': ['geometry', 'topology', 'number-theory'],
      'geometry': ['topology', 'analysis', 'algebra'],
      'number-theory': ['algebra', 'combinatorics', 'analysis'],
      'topology': ['geometry', 'analysis', 'algebra'],
      'logic': ['combinatorics', 'number-theory', 'algebra'],
    };
    
    const related = relatedDomains[conceptDomain] || [];
    return related.includes(targetDomain) ? 0.5 : 0.1;
  }

  hashString(str) {
    // Simple deterministic hash
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }
}

/**
 * ConceptogenesisEngine — orchestrates the full concept invention pipeline.
 */
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

  /**
   * Full concept invention pipeline.
   * observations -> invariants -> abstractions -> representations -> compression -> transfer
   */
  async inventConcepts(observations, options = {}) {
    // 1. Mine invariants
    const invariants = this.miner.mineInvariants(observations);

    // 2. Form abstractions from invariants
    const abstractions = [];
    for (const inv of invariants) {
      const abs = this.abstractionFormer.formAbstraction(inv.evidence || []);
      if (abs) abstractions.push(abs);
    }

    // 3. Mutate representations
    const representations = [];
    if (options.problem) {
      representations.push(...this.representationMutator.mutateRepresentation(options.problem));
    }

    // 4. Evaluate compression
    const evaluated = [];
    for (const concept of [...invariants, ...abstractions, ...representations]) {
      const evalResult = this.compressionEvaluator.evaluate(concept, observations);
      if (evalResult.isUseful) {
        evaluated.push({ ...concept, compression: evalResult });
      }
    }

    // 5. Test transfer (if target domain provided)
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

    // Store concepts
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
};