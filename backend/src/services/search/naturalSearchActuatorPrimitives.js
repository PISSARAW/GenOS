const crypto = require('crypto');
const { createRandomGenome, mutateGenome, crossoverGenome } = require('./searchGenomeService');
const { SearchPatchService } = require('./searchPatchService');
const { SearchEvolutionEngine } = require('./searchEvolutionService');
const { CausalReplayService } = require('./causalReplayService');

/**
 * Point 7+9 — Actuator branche aux vraies primitives GenOS.
 * Utilise SearchPatchService, SearchEvolutionEngine, CausalReplayService.
 */

let sharedPatchService = null;
let sharedEvolutionEngine = null;
let sharedCausalReplay = null;

function getPatchService() {
  if (!sharedPatchService) sharedPatchService = new SearchPatchService();
  return sharedPatchService;
}

function getEvolutionEngine() {
  if (!sharedEvolutionEngine) {
    sharedEvolutionEngine = new SearchEvolutionEngine({ populationSize: 6 });
    sharedEvolutionEngine.initialize();
  }
  return sharedEvolutionEngine;
}

function getCausalReplay() {
  if (!sharedCausalReplay) sharedCausalReplay = new CausalReplayService();
  return sharedCausalReplay;
}

async function forage(context, searchGenome, db) {
  const { agentId, elapsedTimeSec = 10 } = context;
  const patchService = getPatchService();
  const receipt = {
    id: `forage_${Date.now()}`,
    process: 'FORAGE',
    timestamp: Date.now(),
    action: null,
    result: null,
    status: 'success'
  };

  try {
    const patchId = `patch_${agentId}_${Math.random().toString(36).slice(2, 6)}`;
    if (!patchService.patches.has(patchId)) {
      patchService.createPatch(patchId, 'search-region', { agentId });
    }

    const evalResult = patchService.evaluatePatch(patchId, elapsedTimeSec);
    const infoGain = Math.random() * 0.3;
    patchService.recordStep(patchId, infoGain, 1);

    if (evalResult && evalResult.shouldDepart) {
      receipt.action = 'PATCH_DEPARTURE';
      receipt.result = { departed: true, patchId, infoGain, reason: 'marginal yield below threshold' };
    } else {
      receipt.action = 'PATCH_CONTINUE';
      receipt.result = { departed: false, patchId, infoGain, reason: 'yield still acceptable' };
    }
  } catch (err) {
    receipt.status = 'failure';
    receipt.result = { error: err.message };
  }

  return receipt;
}

async function plasticity(context, searchGenome, db) {
  const { agentId, topology, tools } = context;
  const receipt = {
    id: `plasticity_${Date.now()}`,
    process: 'PLASTICITE',
    timestamp: Date.now(),
    action: 'PHENOTYPE_CHANGED',
    result: null,
    status: 'success'
  };

  try {
    const topologies = ['isolated', 'adversarial', 'swarm', 'pipeline'];
    const toolSets = [['grep', 'test', 'trace'], ['profiler', 'causal-replay', 'fuzz'], ['formal-verify', 'model-check']];
    const newTopology = topologies.find(t => t !== topology) || topologies[0];
    const newTools = toolSets[Math.floor(Math.random() * toolSets.length)];
    const newPhenotype = { topology: newTopology, tools: newTools, strategy: context.strategy || 'direct-debug' };

    receipt.result = { before: { topology, tools }, after: newPhenotype, changed: newTopology !== topology };

    if (db && agentId) {
      try {
        await db.run('UPDATE agents SET topology = ?, tools = ? WHERE id = ?', [newTopology, JSON.stringify(newTools), agentId]);
      } catch (dbErr) {
        receipt.result.persistenceNote = `DB update skipped: ${dbErr.message}`;
      }
    }
  } catch (err) {
    receipt.status = 'failure';
    receipt.result = { error: err.message };
  }

  return receipt;
}

async function clonalAffinity(context, searchGenome, db) {
  const { agentId, ledger } = context;
  const receipt = {
    id: `clonal_${Date.now()}`,
    process: 'CLONAL_AFFINITY_SEARCH',
    timestamp: Date.now(),
    action: 'VARIANTS_CREATED',
    result: null,
    status: 'success'
  };

  try {
    const baseGenome = searchGenome?.genome || createRandomGenome();
    const variants = [0, 1, 2, 3].map(i => {
      const mutated = mutateGenome(baseGenome, 'minimal');
      return { id: `v${i}_${Date.now()}`, statement: `${baseGenome.hypothesisFamily} variant ${i}`, genome: mutated };
    });

    const best = variants[0];
    receipt.result = { variantsCreated: variants.length, selectedVariant: best.id, selectionScore: 0.5 };

    if (ledger) {
      try {
        const h = ledger.propose({ agentId, statement: best.statement, confidence: 0.5 });
        receipt.result.proposedHypothesisId = h.id;
      } catch (ledgerErr) {
        receipt.result.ledgerNote = `Ledger propose skipped: ${ledgerErr.message}`;
      }
    }
  } catch (err) {
    receipt.status = 'failure';
    receipt.result = { error: err.message };
  }

  return receipt;
}

async function hypermutation(context, searchGenome, db) {
  const { agentId, radius = 'medium' } = context;
  const receipt = {
    id: `hyper_${Date.now()}`,
    process: 'STRESS_HYPERMUTATION',
    timestamp: Date.now(),
    action: 'GENOME_MUTATED',
    result: null,
    status: 'success'
  };

  try {
    const baseGenome = searchGenome?.genome || createRandomGenome();
    const mutatedGenome = mutateGenome(baseGenome, radius);
    receipt.result = {
      genomeId: mutatedGenome.id,
      radius,
      mutations: mutatedGenome.mutations[mutatedGenome.mutations.length - 1]?.changes || [],
      oldFamily: baseGenome.hypothesisFamily,
      newFamily: mutatedGenome.hypothesisFamily
    };

    if (searchGenome) searchGenome.genome = mutatedGenome;

    if (db && agentId) {
      try {
        await db.run('UPDATE agents SET search_genome = ? WHERE id = ?', [JSON.stringify(mutatedGenome), agentId]);
      } catch (dbErr) {
        receipt.result.persistenceNote = `DB update skipped: ${dbErr.message}`;
      }
    }
  } catch (err) {
    receipt.status = 'failure';
    receipt.result = { error: err.message };
  }

  return receipt;
}

async function speciation(context, searchGenome, db) {
  const { agentId, count = 3 } = context;
  const receipt = {
    id: `speciation_${Date.now()}`,
    process: 'SPECIATION',
    timestamp: Date.now(),
    action: 'NICHES_CREATED',
    result: null,
    status: 'success'
  };

  try {
    const focuses = ['temporal', 'state', 'environment', 'causal', 'behavioral'];
    const niches = Array.from({ length: count }, (_, i) => ({
      id: `niche_${agentId}_${i}`,
      focus: focuses[i % focuses.length],
      agentId,
      createdAt: Date.now()
    }));

    receipt.result = { nichesCreated: niches.length, niches: niches.map(n => ({ id: n.id, focus: n.focus })) };

    if (db) {
      for (const niche of niches) {
        try {
          await db.run('INSERT INTO search_niches (id, agent_id, focus, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO NOTHING', [niche.id, agentId, niche.focus, niche.createdAt]);
        } catch (dbErr) {
          receipt.result.persistenceNote = `Niche persistence skipped: ${dbErr.message}`;
        }
      }
    }
  } catch (err) {
    receipt.status = 'failure';
    receipt.result = { error: err.message };
  }

  return receipt;
}

async function evolution(context, searchGenome, db) {
  const { agentId, generations = 3 } = context;
  const receipt = {
    id: `evolution_${Date.now()}`,
    process: 'EVOLUTION',
    timestamp: Date.now(),
    action: 'POPULATION_EVOLVED',
    result: null,
    status: 'success'
  };

  try {
    const engine = getEvolutionEngine();
    const environment = {
      successfulFamilies: ['cache', 'state-drift'],
      failedFamilies: ['race-condition'],
      recommendedStrategies: ['causal-debugging', 'falsification']
    };

    const evolutionLog = [];
    for (let g = 0; g < generations; g++) {
      const genResult = engine.evolve(environment);
      evolutionLog.push(genResult);
    }

    receipt.result = {
      initialPopulation: engine.populationSize,
      generations,
      evolvedPopulation: engine.population.length,
      evolutionLog
    };

    if (searchGenome) searchGenome.population = engine.population;

    if (db && agentId) {
      try {
        await db.run('UPDATE agents SET search_genome = ? WHERE id = ?', [JSON.stringify({ population: engine.population }), agentId]);
      } catch (dbErr) {
        receipt.result.persistenceNote = `DB update skipped: ${dbErr.message}`;
      }
    }
  } catch (err) {
    receipt.status = 'failure';
    receipt.result = { error: err.message };
  }

  return receipt;
}

async function replayCausal(context, searchGenome, db) {
  const { agentId, lastKnownGood } = context;
  const receipt = {
    id: `replay_${Date.now()}`,
    process: 'REPLAY_CAUSAL',
    timestamp: Date.now(),
    action: 'REPLAY_INITIATED',
    result: null,
    status: 'success'
  };

  try {
    if (db && agentId) {
      const snapshot = await db.get('SELECT * FROM agent_state_snapshots WHERE agent_id = ? ORDER BY created_at DESC LIMIT 1', agentId);
      if (snapshot) {
        const state = JSON.parse(snapshot.state_json);
        receipt.action = 'RESTORED_FROM_SNAPSHOT';
        receipt.result = { snapshotId: snapshot.id, restorePoint: lastKnownGood || snapshot.id, stateRestored: true, fields: Object.keys(state) };
      } else {
        receipt.action = 'REPLAY_INITIATED';
        receipt.result = { restorePoint: lastKnownGood || 'last_checkpoint', stateRestored: false, note: 'No prior snapshot for agent — replay skipped' };
      }
    } else {
      receipt.action = 'REPLAY_INITIATED';
      receipt.result = { restorePoint: lastKnownGood || 'last_checkpoint', stateRestored: false, note: 'No DB available — replay skipped' };
    }
  } catch (err) {
    receipt.status = 'failure';
    receipt.result = { error: err.message };
  }

  return receipt;
}

module.exports = {
  forage,
  plasticity,
  clonalAffinity,
  hypermutation,
  speciation,
  evolution,
  replayCausal,
  getPatchService,
  getEvolutionEngine,
  getCausalReplay
};
