/**
 * Cultural / Plasmid Transmission — Phase 12.
 *
 * Transmet les processus de recherche validés à d'autres agents.
 */

const crypto = require('crypto')

function validValidation(validation) {
  if (!validation || validation.reproducible !== true) return false;
  if (!Number.isFinite(validation.successRate) || validation.successRate < 0.7 || validation.successRate > 1) return false;
  if (!Array.isArray(validation.evidenceRefs)) return false;
  const refs = validation.evidenceRefs.filter(ref => typeof ref === 'string' && ref.trim());
  return new Set(refs).size >= 2;
}

class SearchCultureService {
  constructor() {
    this.plasmids = new Map(); // validated traits
    this.transmissions = [];
    this.received = new Map();
  }

  /**
   * Compile un SearchGenome validé en plasmide réutilisable.
   */
  compilePlasmid(searchGenome, validation) {
    if (!searchGenome || !validValidation(validation)) return null;
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
        reproducible: validation.reproducible,
        evidenceRefs: [...new Set(validation.evidenceRefs)],
        genomeId: searchGenome.id
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
    if (!plasmid || !validValidation(plasmid.validation) || !targetAgentId) return null;

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

  receive(item, agentId) {
    const { plasmid, transmission, sourceAgentId } = item;
    if (!plasmid || !transmission || !validValidation(plasmid.validation)) return false;
    if (transmission.plasmidId !== plasmid.id || transmission.targetAgentId !== agentId || sourceAgentId === agentId) return false;
    this.received.set(transmission.id, structuredClone(item));
    return true;
  }

  getCandidateTrait() {
    const latest = [...this.received.values()].sort((a, b) => a.transmission.transmittedAt - b.transmission.transmittedAt).at(-1);
    return latest ? structuredClone(latest.plasmid.trait) : null;
  }

  getPlasmids() {
    return Array.from(this.plasmids.values());
  }

  getTransmissions() {
    return this.transmissions.slice();
  }
}

module.exports = { SearchCultureService }
