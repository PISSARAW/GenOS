'use strict';

/**
 * @file abstractionFormer.js
 * @description AbstractionFormer — forms abstractions from concrete instances.
 */

const { conceptId } = require('./conceptMiner');

class AbstractionFormer {
  constructor(opts = {}) {
    this.minInstances = opts.minInstances || 3;
  }

  formAbstraction(instances) {
    if (!instances || instances.length < this.minInstances) return null;

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

module.exports = { AbstractionFormer };