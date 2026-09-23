'use strict';

/**
 * Agent Phenotype Registry — composable phenotype definitions.
 *
 * Each phenotype is a composable object (NOT an enum) describing
 * an agent's capabilities, cognition level, memory, communication,
 * and authority. Used at incarnation time to derive tool leases,
 * spawn budgets, and permission checks.
 */

const FULL_AUTHORITY = Object.freeze({
  read: true, analyze: true, execute: true, write: true,
  spawn: true, delegate: true, promote: true, mutate: true,
  topology: true, strategy: true
});

const FULL_MEMORY = Object.freeze({
  episodic: true, semantic: true, procedural: true, autobiographical: true
});

const ALL_COMM = Object.freeze({
  signal: true, publish: true, inbox: true, broadcast: true
});

const PHENOTYPES = Object.freeze({
  ScoutCell: Object.freeze({
    id: 'ScoutCell',
    description: 'Lightweight observation and analysis unit — surfaces signals only',
    cognitionLevel: 'reactive',
    persistence: 'ephemeral',
    adaptationLevel: 'none',
    delegationDepth: 0,
    spawnBudget: 0,
    authorityProfile: Object.freeze({
      read: true, analyze: true, execute: false, write: false,
      spawn: false, delegate: false, promote: false, mutate: false,
      topology: false, strategy: false
    }),
    memoryProfile: Object.freeze({
      episodic: true, semantic: false, procedural: false, autobiographical: false
    }),
    communicationProfile: Object.freeze({
      signal: true, publish: false, inbox: false, broadcast: false
    })
  }),

  BoundedWorker: Object.freeze({
    id: 'BoundedWorker',
    description: 'Task executor with read/execute rights — no spawn, no promotion',
    cognitionLevel: 'reactive',
    persistence: 'ephemeral',
    adaptationLevel: 'none',
    delegationDepth: 0,
    spawnBudget: 0,
    authorityProfile: Object.freeze({
      read: true, analyze: false, execute: true, write: false,
      spawn: false, delegate: false, promote: false, mutate: false,
      topology: false, strategy: false
    }),
    memoryProfile: Object.freeze({
      episodic: true, semantic: true, procedural: true, autobiographical: false
    }),
    communicationProfile: Object.freeze({
      signal: true, publish: false, inbox: false, broadcast: false
    })
  }),

  AdaptiveWorker: Object.freeze({
    id: 'AdaptiveWorker',
    description: 'Self-adjusting worker — requests capabilities, adapts local strategy',
    cognitionLevel: 'adaptive',
    persistence: 'ephemeral',
    adaptationLevel: 'local',
    delegationDepth: 0,
    spawnBudget: 0,
    authorityProfile: Object.freeze({
      read: true, analyze: false, execute: true, write: false,
      spawn: false, delegate: false, promote: false, mutate: false,
      topology: false, strategy: true
    }),
    memoryProfile: Object.freeze({
      episodic: true, semantic: true, procedural: true, autobiographical: false
    }),
    communicationProfile: Object.freeze({
      signal: true, publish: true, inbox: true, broadcast: false
    })
  }),

  Specialist: Object.freeze({
    id: 'Specialist',
    description: 'Deep expertise in a single domain — focused authority',
    cognitionLevel: 'adaptive',
    persistence: 'persistent',
    adaptationLevel: 'local',
    delegationDepth: 0,
    spawnBudget: 0,
    authorityProfile: Object.freeze({
      read: true, analyze: true, execute: true, write: true,
      spawn: false, delegate: false, promote: false, mutate: false,
      topology: false, strategy: false
    }),
    memoryProfile: Object.freeze({
      episodic: true, semantic: true, procedural: true, autobiographical: true
    }),
    communicationProfile: Object.freeze({
      signal: true, publish: true, inbox: true, broadcast: false
    })
  }),

  Verifier: Object.freeze({
    id: 'Verifier',
    description: 'Independent validation and adversarial review agent',
    cognitionLevel: 'adaptive',
    persistence: 'ephemeral',
    adaptationLevel: 'none',
    delegationDepth: 0,
    spawnBudget: 0,
    authorityProfile: Object.freeze({
      read: true, analyze: true, execute: true, write: false,
      spawn: false, delegate: false, promote: false, mutate: false,
      topology: false, strategy: false
    }),
    memoryProfile: Object.freeze({
      episodic: true, semantic: true, procedural: true, autobiographical: false
    }),
    communicationProfile: Object.freeze({
      signal: true, publish: true, inbox: true, broadcast: false
    })
  }),

  SubOrchestrator: Object.freeze({
    id: 'SubOrchestrator',
    description: 'Bounded subgraph coordinator — no global topology changes',
    cognitionLevel: 'strategic',
    persistence: 'persistent',
    adaptationLevel: 'tactical',
    delegationDepth: 1,
    spawnBudget: 5,
    authorityProfile: Object.freeze({
      read: true, analyze: true, execute: true, write: true,
      spawn: true, delegate: true, promote: false, mutate: false,
      topology: false, strategy: true
    }),
    memoryProfile: Object.freeze({
      episodic: true, semantic: true, procedural: true, autobiographical: false
    }),
    communicationProfile: Object.freeze({
      signal: true, publish: true, inbox: true, broadcast: false
    })
  }),

  Orchestrator: Object.freeze({
    id: 'Orchestrator',
    description: 'Full mission authority — spawn, promote, topology, strategy',
    cognitionLevel: 'metacognitive',
    persistence: 'permanent',
    adaptationLevel: 'strategic',
    delegationDepth: 2,
    spawnBudget: 12,
    authorityProfile: FULL_AUTHORITY,
    memoryProfile: FULL_MEMORY,
    communicationProfile: ALL_COMM
  }),

  ResidentDaemon: Object.freeze({
    id: 'ResidentDaemon',
    description: 'Long-running observer — report only, no mission decisions',
    cognitionLevel: 'reactive',
    persistence: 'permanent',
    adaptationLevel: 'none',
    delegationDepth: 0,
    spawnBudget: 0,
    authorityProfile: Object.freeze({
      read: true, analyze: true, execute: false, write: false,
      spawn: false, delegate: false, promote: false, mutate: false,
      topology: false, strategy: false
    }),
    memoryProfile: Object.freeze({
      episodic: true, semantic: false, procedural: false, autobiographical: false
    }),
    communicationProfile: Object.freeze({
      signal: true, publish: true, inbox: false, broadcast: false
    })
  }),

  Reconciler: Object.freeze({
    id: 'Reconciler',
    description: 'Cleanup and garbage collection — post-mission hygiene',
    cognitionLevel: 'reactive',
    persistence: 'ephemeral',
    adaptationLevel: 'none',
    delegationDepth: 0,
    spawnBudget: 0,
    authorityProfile: Object.freeze({
      read: true, analyze: true, execute: true, write: true,
      spawn: false, delegate: false, promote: false, mutate: false,
      topology: false, strategy: false
    }),
    memoryProfile: Object.freeze({
      episodic: true, semantic: false, procedural: false, autobiographical: false
    }),
    communicationProfile: Object.freeze({
      signal: false, publish: true, inbox: false, broadcast: false
    })
  })
});

const PHENOTYPES_BY_ID = Object.freeze(
  new Map(Object.values(PHENOTYPES).map((p) => [p.id, p]))
);

function getPhenotype(id) {
  return PHENOTYPES_BY_ID.get(id) || null;
}

function listPhenotypes() {
  return Object.values(PHENOTYPES);
}

function isCompatible(phenotypeId, action) {
  const phenotype = getPhenotype(phenotypeId);
  if (!phenotype) return false;
  return Boolean(phenotype.authorityProfile[action]);
}

function getAuthorityProfile(phenotypeId) {
  const phenotype = getPhenotype(phenotypeId);
  return phenotype ? phenotype.authorityProfile : null;
}

function canSpawn(phenotypeId) {
  const phenotype = getPhenotype(phenotypeId);
  if (!phenotype) return false;
  return phenotype.authorityProfile.spawn && phenotype.spawnBudget > 0;
}

module.exports = {
  PHENOTYPES,
  getPhenotype,
  listPhenotypes,
  isCompatible,
  getAuthorityProfile,
  canSpawn
};
