/**
 * GenOS Syncytium Cytoplasm Service
 * Continuous electrochemical state synchronization via ionic fluxes (Ca2+, K+, Na+)
 * and cytoplasmic diffusion, bypassing discrete JSON field mutations.
 */

const DEFAULT_IONS = {
  'Ca2+': { baseConcentration: 0.0001, charge: 2, diffusionRate: 0.22 },
  'K+': { baseConcentration: 140.0, charge: 1, diffusionRate: 0.85 },
  'Na+': { baseConcentration: 12.0, charge: 1, diffusionRate: 0.70 }
};

class SyncytiumCytoplasm {
  constructor(initialState = {}) {
    this.membranePotentialMv = -70.0; // Resting potential -70mV
    this.ions = new Map();
    for (const [ion, cfg] of Object.entries(DEFAULT_IONS)) {
      this.ions.set(ion, {
        concentration: cfg.baseConcentration,
        gradient: 0.0,
        fluxCount: 0
      });
    }
    this.molecules = new Map();
    this.lastTickMs = Date.now();
  }

  propagateIonicFlux(ionName, deltaFlux, agentId = 'worker') {
    const cfg = DEFAULT_IONS[ionName] || { baseConcentration: 1.0, charge: 1, diffusionRate: 0.5 };
    const current = this.ions.get(ionName) || { concentration: cfg.baseConcentration, gradient: 0.0, fluxCount: 0 };

    const newConcentration = Math.max(0, current.concentration + deltaFlux * cfg.diffusionRate);
    const gradient = newConcentration - cfg.baseConcentration;

    // Shift membrane potential proportionally to ion charge and gradient
    const nernstShift = (cfg.charge * gradient * 12.5);
    this.membranePotentialMv = Math.max(-90.0, Math.min(40.0, this.membranePotentialMv + nernstShift));

    current.concentration = Number(newConcentration.toFixed(5));
    current.gradient = Number(gradient.toFixed(5));
    current.fluxCount += 1;
    current.lastSource = agentId;

    this.ions.set(ionName, current);
    return {
      ion: ionName,
      concentration: current.concentration,
      gradient: current.gradient,
      membranePotentialMv: Number(this.membranePotentialMv.toFixed(2))
    };
  }

  diffuseMolecule(moleculeName, amountVector = [0, 0, 0]) {
    const existing = this.molecules.get(moleculeName) || [0, 0, 0];
    const updated = existing.map((val, idx) => Number((val + (amountVector[idx] || 0) * 0.9).toFixed(4)));
    this.molecules.set(moleculeName, updated);
    return { molecule: moleculeName, vector: updated };
  }

  snapshotState() {
    const ionState = {};
    for (const [key, val] of this.ions.entries()) {
      ionState[key] = { ...val };
    }
    const moleculeState = {};
    for (const [key, val] of this.molecules.entries()) {
      moleculeState[key] = [...val];
    }
    return {
      membranePotentialMv: this.membranePotentialMv,
      ions: ionState,
      molecules: moleculeState,
      timestampMs: Date.now()
    };
  }
}

function createCytoplasm(initialState) {
  return new SyncytiumCytoplasm(initialState);
}

module.exports = {
  SyncytiumCytoplasm,
  createCytoplasm,
  DEFAULT_IONS
};
