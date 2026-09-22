'use strict';

/**
 * @file conceptMiner.js
 * @description ConceptMiner — mines invariants from experimental data.
 */

const crypto = require('node:crypto');

function conceptId() {
  return `concept-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

class ConceptMiner {
  constructor(opts = {}) {
    this.minSupport = opts.minSupport || 0.7;
    this.minConfidence = opts.minConfidence || 0.8;
  }

  mineInvariants(observations) {
    if (!observations || observations.length < 1) return [];

    const invariants = [];

    const structural = this.mineStructuralInvariants(observations);
    invariants.push(...structural);

    const numerical = this.mineNumericalInvariants(observations);
    invariants.push(...numerical);

    const relational = this.mineRelationalInvariants(observations);
    invariants.push(...relational);

    const typePatterns = this.mineTypePatterns(observations);
    invariants.push(...typePatterns);

    return invariants.filter(inv => inv.support >= this.minSupport && inv.confidence >= this.minConfidence);
  }

  /**
   * Mine patterns from anomaly types.
   * When the same anomaly type appears repeatedly across observations,
   * it signals a structural pattern worth noting.
   */
  mineTypePatterns(observations) {
    const typeCounts = {};
    for (const obs of observations) {
      const type = obs.type || 'unknown';
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    }

    const invariants = [];
    const total = observations.length;

    for (const [type, count] of Object.entries(typeCounts)) {
      const support = count / total;
      // Only emit if the pattern is significant (appears in >= 30% of observations)
      // and we have enough observations
      if (support >= 0.3 && total >= 3) {
        invariants.push({
          type: 'type_pattern',
          statement: `Recurring anomaly type "${type}" observed in ${(support * 100).toFixed(0)}% of observations`,
          support,
          confidence: support,
          evidence: observations.filter(o => o.type === type).map(o => o.description || o.source),
          metadata: { anomalyType: type, count, total },
        });
      }
    }

    return invariants;
  }

  mineStructuralInvariants(observations) {
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
    const invariants = [];
    const numericFields = ['size', 'degree', 'chromaticNumber', 'cliqueNumber', 'diameter'];

    for (const field of numericFields) {
      const values = observations
        .map(o => o.output?.[field] || o.context?.[field])
        .filter(v => typeof v === 'number');

      if (values.length < 3) continue;

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

      if (values.length >= 4) {
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
    return [];
  }
}

module.exports = { ConceptMiner, conceptId };