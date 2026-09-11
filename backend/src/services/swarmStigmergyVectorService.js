/**
 * GenOS Swarm Stigmergy & Phase Resonance Service
 * Bio-inspired trail pheromones and Kuramoto oscillator consensus,
 * replacing JSON-based vote polling and proposals.
 */

class SwarmPheromoneMatrix {
  constructor(defaultHalfLifeMs = 60000) {
    this.halfLifeMs = defaultHalfLifeMs;
    this.trails = new Map(); // marker -> { intensity, lastUpdatedMs }
    this.oscillators = new Map(); // agentId -> { phase, naturalFreq }
  }

  depositTrace(marker, amount, isRepellent = false) {
    const now = Date.now();
    const current = this.getDecayedIntensity(marker, now);
    const delta = isRepellent ? -Math.abs(amount) : Math.abs(amount);
    const newIntensity = Math.max(-100.0, Math.min(100.0, current + delta));

    this.trails.set(marker, {
      intensity: Number(newIntensity.toFixed(4)),
      lastUpdatedMs: now
    });
    return this.trails.get(marker);
  }

  getDecayedIntensity(marker, now = Date.now()) {
    const entry = this.trails.get(marker);
    if (!entry) return 0.0;
    const elapsedMs = Math.max(0, now - entry.lastUpdatedMs);
    const decayFactor = Math.pow(0.5, elapsedMs / this.halfLifeMs);
    return Number((entry.intensity * decayFactor).toFixed(4));
  }

  alignOscillator(agentId, phase, naturalFreq = 1.0) {
    this.oscillators.set(agentId, {
      phase: Number((phase % (2 * Math.PI)).toFixed(4)),
      naturalFreq: Number(naturalFreq.toFixed(4)),
      lastSyncMs: Date.now()
    });
  }

  computeKuramotoOrder() {
    if (this.oscillators.size === 0) return { orderParameter: 0.0, meanPhase: 0.0 };
    let sumCos = 0.0;
    let sumSin = 0.0;
    for (const osc of this.oscillators.values()) {
      sumCos += Math.cos(osc.phase);
      sumSin += Math.sin(osc.phase);
    }
    const n = this.oscillators.size;
    const r = Math.sqrt(sumCos * sumCos + sumSin * sumSin) / n;
    const psi = Math.atan2(sumSin, sumCos);
    return {
      orderParameter: Number(r.toFixed(4)), // r in [0, 1] (1.0 = perfect phase coherence)
      meanPhase: Number(psi.toFixed(4)),
      agentCount: n
    };
  }

  selectDominantPath() {
    const now = Date.now();
    let bestMarker = null;
    let highestIntensity = -Infinity;
    for (const marker of this.trails.keys()) {
      const val = this.getDecayedIntensity(marker, now);
      if (val > highestIntensity && val > 0) {
        highestIntensity = val;
        bestMarker = marker;
      }
    }
    return {
      dominantPath: bestMarker,
      intensity: highestIntensity > 0 ? highestIntensity : 0.0
    };
  }
}

function createSwarmMatrix(halfLifeMs) {
  return new SwarmPheromoneMatrix(halfLifeMs);
}

module.exports = {
  SwarmPheromoneMatrix,
  createSwarmMatrix
};
