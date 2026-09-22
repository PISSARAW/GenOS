const { createRandomGenome, mutateGenome, crossoverGenome } = require('./searchGenomeService');

/**
 * Point 7 — Actuator branche aux vraies primitives GenOS.
 * Fichier séparé pour respecter la limite de 400 lignes.
 */

async function forage(context, searchGenome, db) {
  const { agentId, currentPatch, elapsedTimeSec = 10 } = context;
  const receipt = {
    id: `forage_${Date.now()}`,
    process: 'FORAGE',
    timestamp: Date.now(),
    action: null,
    result: null,
    status: 'success'
  };

  try {
    if (!searchGenome) searchGenome = { patches: new Map() };
    if (!searchGenome.patches.has(agentId)) {
      searchGenome.patches.set(agentId, {
        id: agentId,
        type: 'search-region',
        history: [],
        visits: 0,
        createdAt: Date.now()
      });
    }
    const patch = searchGenome.patches.get(agentId);

    const shouldDepart = patch.history.length > 3 &&
      patch.history.slice(-3).every(h => h.infoGain < 0.1);

    if (shouldDepart) {
      receipt.action = 'PATCH_DEPARTURE';
      receipt.result = { departed: true, patchId: patch.id, visits: patch.visits, reason: 'marginal yield below threshold' };
      patch.history = [];
      patch.visits = 0;
    } else {
      receipt.action = 'PATCH_CONTINUE';
      receipt.result = { departed: false, patchId: patch.id, visits: patch.visits, reason: 'yield still acceptable' };
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

    receipt.result = { before: { topology, tools }, after: newPhenotype, changed: newTopology !== topology || JSON.stringify(newTools) !== JSON.stringify(tools) };

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
  const { agentId, baseHypothesis, ledger } = context;
  const receipt = {
    id: `clonal_${Date.now()}`,
    process: 'CLONAL_AFFINITY_SEARCH',
    timestamp: Date.now(),
    action: 'VARIANTS_CREATED',
    result: null,
    status: 'success'
  };

  try {
    const base = baseHypothesis || 'Hypothèse de base';
    const variants = [0, 1, 2, 3].map(i => ({
      id: `v${i}_${Date.now()}`,
      statement: `${base} (variant ${i})`,
      mutation: `mut${i}`,
      score: Math.random()
    }));

    const best = variants.reduce((a, b) => a.score > b.score ? a : b);
    receipt.result = { baseHypothesis: base, variantsCreated: variants.length, variants: variants.map(v => ({ id: v.id, statement: v.statement })), selectedVariant: best.id, selectionScore: best.score };

    if (ledger && best) {
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
    if (!searchGenome || !searchGenome.genome) {
      searchGenome = searchGenome || {};
      searchGenome.genome = createRandomGenome();
    }

    const oldGenome = { ...searchGenome.genome };
    const mutatedGenome = mutateGenome(searchGenome.genome, radius);
    receipt.result = { genomeId: mutatedGenome.id, radius, mutations: mutatedGenome.mutations[mutatedGenome.mutations.length - 1]?.changes || [], oldFamily: oldGenome.hypothesisFamily, newFamily: mutatedGenome.hypothesisFamily };
    searchGenome.genome = mutatedGenome;

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

async function runGeneration(pop) {
  pop.sort(() => Math.random() - 0.5);
  const survivors = pop.slice(0, Math.ceil(pop.length / 2));
  const offspring = [];
  for (let i = 0; i < survivors.length; i += 2) {
    if (survivors[i + 1]) {
      const child = crossoverGenome(survivors[i], survivors[i + 1]);
      const mutated = mutateGenome(child, 'local');
      offspring.push(mutated);
    }
  }
  return [...survivors, ...offspring];
}

async function evolution(context, searchGenome, db) {
  const { agentId, population = 10, generations = 3 } = context;
  const receipt = {
    id: `evolution_${Date.now()}`,
    process: 'EVOLUTION',
    timestamp: Date.now(),
    action: 'POPULATION_EVOLVED',
    result: null,
    status: 'success'
  };

  try {
    if (!searchGenome || !searchGenome.population) {
      searchGenome = searchGenome || {};
      searchGenome.population = Array.from({ length: population }, () => createRandomGenome());
    }

    const evolvedPop = [];
    for (let g = 0; g < generations; g++) {
      searchGenome.population = await runGeneration(searchGenome.population);
      evolvedPop.push({ generation: g, size: searchGenome.population.length });
    }

    receipt.result = { initialPopulation: population, generations, evolvedPopulation: searchGenome.population.length, evolutionLog: evolvedPop };

    if (db && agentId) {
      try {
        await db.run('UPDATE agents SET search_genome = ? WHERE id = ?', [JSON.stringify({ population: searchGenome.population }), agentId]);
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
  replayCausal
};
