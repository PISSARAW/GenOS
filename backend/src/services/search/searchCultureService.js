/**
 * Cultural / Plasmid Transmission — Phase 12.
 *
 * Transmet les processus de recherche validés à d'autres agents.
 */

const crypto = require('crypto')
const { createRandomGenome } = require('./searchGenomeService')

class SearchCultureService {
  constructor() {
    this.plasmids = new Map(); // validated traits
    this.transmissions = [];
  }

  /**
   * Compile un SearchGenome validé en plasmide réutilisable.
   */
  compilePlasmid(searchGenome, validation) {
    const id = `plasmid_${crypto.randomBytes(6).toString('hex')}`;
    const plasmid = {
      id,
      trait: {
        strategy: searchGenome.strategy,
        hypothesisFamily: searchGenome.hypothesisFamily,
        operators: searchGenome.operators,
        evidencePolicy: searchGenome.evidencePolicy
      },
      validation: {
        environment: validation.environment,
        generations: validation.generations,
        successRate: validation.successRate,
        reproducible: validation.reproducible
      },
      createdAt: Date.now(),
      transmissions: 0
    };
    this.plasmids.set(id, plasmid);
    return plasmid;
  }

  /**
   * Transmettre un plasmide à un autre agent.
   */
  transmit(plasmidId, targetAgentId) {
    const plasmid = this.plasmids.get(plasmidId);
    if (!plasmid) return null;

    plasmid.transmissions++;
    const transmission = {
      id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      plasmidId,
      targetAgentId,
      trait: plasmid.trait,
      transmittedAt: Date.now()
    };
    this.transmissions.push(transmission);
    return transmission;
  }

  getPlasmids() {
    return Array.from(this.plasmids.values());
  }

  getTransmissions() {
    return this.transmissions.slice();
  }
}

module.exports = { SearchCultureService }
