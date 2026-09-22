'use strict';

/**
 * @file compressionEvaluator.js
 * @description CompressionEvaluator — evaluates if a concept compresses knowledge.
 */

class CompressionEvaluator {
  evaluate(concept, instances) {
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
    return JSON.stringify(obj).length;
  }
}

module.exports = { CompressionEvaluator };