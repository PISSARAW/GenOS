'use strict';

const crypto = require('crypto');

const DIMENSIONS = Object.freeze([
  'existence', 'continuity', 'composition', 'characteristics',
  'biology', 'experience', 'personalIdentity', 'relations',
  'functions', 'origin', 'currentState', 'substrate',
  'uncertainty', 'governance'
]);

function known(value, source, observedAt = null) {
  return { status: 'known', value, provenance: { source, observedAt } };
}

function unknown(reason) {
  return { status: 'unknown', value: null, provenance: null, reason };
}

function present(value) {
  return value !== null && value !== undefined && value !== '';
}

function rowOf(input) {
  return input.agentRow?.id === input.agentId ? input.agentRow : null;
}

function daemonOf(input) {
  return input.daemon?.daemonId === input.agentId ? input.daemon : null;
}

function identityKind(input) {
  if (input.kind === 'daemon' || input.daemon) return 'daemon';
  if (input.agentRow?.role === 'resident_daemon') return 'daemon';
  if (input.kind === 'orchestrator' || input.agentRow?.execution_mode === 'orchestrator'
    || input.agentRow?.role === 'orchestrator') return 'orchestrator';
  return 'worker';
}

function anchorOf(input) {
  const row = rowOf(input);
  const daemon = daemonOf(input);
  if (row) {
    return known({ agentId: row.id, bornAt: row.created_at || null, lifecycle: row.status || null },
      'agents', row.updated_at || row.created_at || null);
  }
  if (daemon) {
    return known({ agentId: daemon.daemonId, bornAt: daemon.createdAt || null,
      lifecycle: daemon.activity || null }, 'daemon_runtime_state', daemon.updatedAt || null);
  }
  return unknown('No authoritative registration for this agentId');
}

function continuityOf(input) {
  const row = rowOf(input);
  const parentId = row?.parent_agent_id || row?.parent_id || null;
  if (row) {
    return known({ parentId, relation: row.lineage_relation || null,
      lineageId: row.lineage_id || null }, 'agents', row.updated_at || null);
  }
  const daemon = daemonOf(input);
  if (daemon) {
    return known({ parentId: null, relation: 'resident', lineageId: null,
      resumed: daemon.resumed === true }, 'daemon_runtime_state', daemon.updatedAt || null);
  }
  return unknown('No registered lineage or daemon continuity');
}

function compositionOf(input) {
  const expression = input.expression;
  const genome = expression?.genotype;
  const daemonGenome = input.daemon?.genomeRef;
  const ref = genome?.genomeRef || daemonGenome;
  if (!present(ref)) return unknown('Genome reference was not observed');
  return known({ genomeRef: ref, genomeContentHash: genome?.genomeContentHash || null,
    plasmids: expression?.plasmids || [] }, genome ? 'agent_dna' : 'daemon_runtime', null);
}

function characteristicsOf(input) {
  const operational = input.self?.operational;
  if (!hasObservedCharacteristics(operational)) {
    return unknown('No observed competence or capabilities');
  }
  return known({ capabilities: operational.capabilities || [],
    limitations: operational.limitations?.knownWeaknesses || [],
    calibration: operational.competence || null }, 'agentSelf.operational', null);
}

function hasObservedCharacteristics(operational) {
  if (!operational) return false;
  return (operational.competence?.calibrationObservations || 0) > 0;
}

function biologyOf(input) {
  const daemon = daemonOf(input);
  const pressure = input.expression?.currentPressure;
  if (pressure?.status === 'sensed') {
    return known({ pressure, homeostasis: input.expression?.homeostasis || null,
      clinical: input.expression?.clinicalState || null }, 'machineInteroception', null);
  }
  if (daemon) return known({ health: daemon.health || null, activity: daemon.activity || null,
    revisions: daemon.revisions ?? null }, 'daemon_runtime_state', daemon.updatedAt || null);
  return unknown('No measured computational physiology');
}

function experienceOf(input) {
  const autobiographical = input.self?.autobiographical;
  if (!autobiographical?.sourcesQueried?.episodes || !autobiographical?.sourcesQueried?.lessons) {
    return unknown('Autobiographical store not fully queried');
  }
  return known({ episodes: autobiographical.episodes || [], lessons: autobiographical.lessons || [],
    turningPoints: autobiographical.turningPoints || [] }, 'agentSelf.autobiographical', null);
}

function personalIdentityOf(input) {
  const identity = input.self?.identity;
  if (!identity) return unknown('No personal identity record');
  if (!rowOf(input)) return unknown('No registered personal identity');
  return known({ name: identity.name, nameMeaning: identity.nameMeaning || null,
    creatorIntent: identity.creatorIntent || null }, 'agentSelf.identity', null);
}

function relationsOf(input) {
  const relations = input.expression?.relations;
  if (relations) return known({ relations, topology: input.expression.topologyMembership || null },
    'collectiveState', null);
  const row = rowOf(input);
  if (row) {
    return known({ parentId: row.parent_agent_id || null, topology: null },
      'agents', row.updated_at || null);
  }
  return unknown('Relations not queried');
}

function functionsOf(input) {
  const row = rowOf(input);
  if (row) return known({ role: row.role,
    currentTask: row.current_task || null, executionMode: row.execution_mode || null },
  'agents', row.updated_at || null);
  const daemon = daemonOf(input);
  if (daemon) {
    return known({ role: 'resident_daemon', territoryId: daemon.territoryId },
      'daemon_runtime_state', daemon.updatedAt || null);
  }
  return unknown('No registered role or function');
}

function originOf(input) {
  const row = rowOf(input);
  if (row) return known({ createdAt: row.created_at || null,
    parentId: row.parent_agent_id || null, creatorIntent: row.creator_intent || null },
  'agents', row.created_at || null);
  const daemon = daemonOf(input);
  if (daemon) {
    return known({ createdAt: daemon.createdAt || null, genomeRef: daemon.genomeRef || null },
      'daemon_runtime_state', daemon.createdAt || null);
  }
  return unknown('Genesis record unavailable');
}

function currentStateOf(input) {
  const row = rowOf(input);
  if (row) return known({ status: row.status,
    task: row.current_task || null, isApoptotic: row.is_apoptotic === 1,
    regulation: input.self?.regulatory || null },
  'agents', row.updated_at || null);
  const daemon = daemonOf(input);
  if (daemon) {
    return known({ activity: daemon.activity, health: daemon.health },
      'daemon_runtime_state', daemon.updatedAt || null);
  }
  return unknown('No current runtime observation');
}

function substrateOf(input) {
  const row = rowOf(input);
  if (row) return known({ runtimeExecutable: row.runtime_executable || null,
    runtimePid: row.runtime_pid || null, modelTier: row.model_tier || null,
    workspaceId: row.workspace_id || null }, 'agents', row.updated_at || null);
  const daemon = daemonOf(input);
  if (daemon) {
    return known({ territoryId: daemon.territoryId,
      genomeRef: daemon.genomeRef || null }, 'daemon_runtime_state', daemon.updatedAt || null);
  }
  return unknown('Execution substrate not observed');
}

function governanceOf(input) {
  const authority = input.expression?.authority;
  if (authority) return known(authority, 'authorityProfile', null);
  return unknown('Authority profile not resolved');
}

function buildDimensions(input) {
  const dimensions = {
    existence: anchorOf(input), continuity: continuityOf(input),
    composition: compositionOf(input), characteristics: characteristicsOf(input),
    biology: biologyOf(input), experience: experienceOf(input),
    personalIdentity: personalIdentityOf(input), relations: relationsOf(input),
    functions: functionsOf(input), origin: originOf(input),
    currentState: currentStateOf(input), substrate: substrateOf(input),
    governance: governanceOf(input)
  };
  const unknownDimensions = Object.keys(dimensions).filter(key => dimensions[key].status === 'unknown');
  dimensions.uncertainty = known({ unknownDimensions,
    epistemic: input.expression?.epistemicState?.uncertainties || [] },
  'identityDossier.derive', null);
  return dimensions;
}

function decisionConstraintsOf(dimensions) {
  const lifecycle = dimensions.currentState.value?.status;
  const health = dimensions.currentState.value?.health;
  const apoptotic = dimensions.currentState.value?.isApoptotic === true;
  const inactive = ['terminated', 'apoptosis', 'Apoptosis'].includes(lifecycle) || health === 'APOPTOTIC' || apoptotic;
  return { mayAct: dimensions.existence.status === 'known' && !inactive,
    identityRegistered: dimensions.existence.status === 'known',
    unknownDimensions: dimensions.uncertainty.value.unknownDimensions,
    reason: dimensions.existence.status !== 'known' ? 'UNREGISTERED_IDENTITY'
      : inactive ? 'TERMINAL_STATE' : null };
}

function buildIdentityDossier(input) {
  if (!input?.agentId) throw new Error('buildIdentityDossier requires agentId');
  const dimensions = buildDimensions(input);
  const version = crypto.createHash('sha256').update(JSON.stringify(dimensions)).digest('hex');
  return { apiVersion: 'genos.identity-dossier/v1', agentId: input.agentId,
    kind: identityKind(input), version, dimensions,
    decisionConstraints: decisionConstraintsOf(dimensions) };
}

function validateIdentityDossier(dossier) {
  if (!dossier?.agentId || !dossier?.dimensions) return false;
  return DIMENSIONS.every(key => ['known', 'unknown', 'contested'].includes(dossier.dimensions[key]?.status));
}

module.exports = { DIMENSIONS, buildIdentityDossier, validateIdentityDossier, decisionConstraintsOf };
