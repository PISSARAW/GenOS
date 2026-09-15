/**
 * Biomimicry Handler: Superfetation Pipeline (Superfétation / Gestation Asynchrone)
 *
 * Simulates asynchronous secondary conception during an ongoing gestation.
 * An advanced elder agent (stage T+k) shares workspace and knowledge cache with
 * a newly initialized cadet agent (stage T0) without halting ongoing verification.
 */

const crypto = require('crypto');
const adaptivePersister = require('../../../adaptiveStateBootstrap');

// In-memory registry of superfetation pipelines
const SUPERFETATION_REGISTRY = new Map();

function generateId(prefix) {
  return `${prefix}_${Math.random().toString(36).substring(2, 9)}`;
}

function handleSpawn(args) {
  const elderId = args.elder_agent_id || 'agent_elder_alpha';
  const elderSteps = args.elder_gestational_age_steps || 30;
  const elderCache = args.elder_knowledge_cache || { verified_facts: ['db_migrated', 'types_checked'], checkpoint_index: 5 };
  const cadetTask = args.cadet_specialized_task || 'parallel_subtask_exploration';

  const pipelineId = generateId('superfetation_pipeline');
  const cadetId = generateId('agent_cadet_embryo');

  const elderRecord = {
    agentId: elderId,
    gestationalStage: 'advanced_evaluation',
    gestationalAgeSteps: elderSteps,
    knowledgeCache: elderCache
  };

  const cadetRecord = {
    agentId: cadetId,
    gestationalStage: 'embryonic_init',
    gestationalAgeSteps: 0,
    specializedTask: cadetTask,
    inheritedCacheSize: Object.keys(elderCache.verified_facts || []).length,
    boostFactor: 1.5 // Accelerated initial ramp-up from elder cache
  };

  const record = {
    pipelineId,
    elder: elderRecord,
    cadet: cadetRecord,
    gestationalAgeDelta: elderSteps,
    syncStatus: 'asynchronously_gestating',
    createdAt: new Date().toISOString()
  };

  SUPERFETATION_REGISTRY.set(pipelineId, record);

  return {
    configured: true,
    success: true,
    status: 'superfetation_initialized',
    pipeline_id: pipelineId,
    elder_agent: elderRecord,
    cadet_agent: cadetRecord,
    gestational_age_gap: elderSteps,
    knowledge_inherited: true,
    output: `Superfetation active: Cadet [${cadetId}] (T_0) spawned alongside Elder [${elderId}] (T_${elderSteps}).`
  };
}

function handleSyncDiff(args) {
  const pipelineId = args.pipeline_id;
  const record = SUPERFETATION_REGISTRY.get(pipelineId);

  if (!record) {
    return {
      configured: true,
      success: false,
      status: 'not_found',
      error: `Superfetation pipeline [${pipelineId}] not found.`
    };
  }

  // Advance cadet steps if requested
  const cadetProgress = args.cadet_step_increment || 5;
  const elderProgress = args.elder_step_increment || 1;

  record.cadet.gestationalAgeSteps += cadetProgress;
  record.elder.gestationalAgeSteps += elderProgress;
  record.gestationalAgeDelta = Math.max(0, record.elder.gestationalAgeSteps - record.cadet.gestationalAgeSteps);

  return {
    configured: true,
    success: true,
    status: 'gestation_synchronized',
    pipeline_id: pipelineId,
    elder_steps: record.elder.gestationalAgeSteps,
    cadet_steps: record.cadet.gestationalAgeSteps,
    remaining_gestational_gap: record.gestationalAgeDelta,
    co_gestation_converged: record.gestationalAgeDelta === 0,
    output: `Gestational status: Elder at step ${record.elder.gestationalAgeSteps}, Cadet at step ${record.cadet.gestationalAgeSteps} (Gap: ${record.gestationalAgeDelta}).`
  };
}

function handleStatus(args) {
  const pipelineId = args.pipeline_id;
  if (pipelineId) {
    const record = SUPERFETATION_REGISTRY.get(pipelineId);
    if (!record) return { configured: true, success: false, error: 'Not found' };
    return { configured: true, success: true, pipeline: record };
  }

  const allPipelines = Array.from(SUPERFETATION_REGISTRY.values()).map(r => ({
    pipelineId: r.pipelineId,
    elderId: r.elder.agentId,
    cadetId: r.cadet.agentId,
    gap: r.gestationalAgeDelta
  }));

  return {
    configured: true,
    success: true,
    total_pipelines: allPipelines.length,
    pipelines: allPipelines
  };
}

async function handle(args, run) {
  const action = (args && args.action) || 'status';

  switch (action) {
    case 'superfetate_secondary_embryo':
      return handleSpawn(args);
    case 'synchronize_gestational_diff':
      return handleSyncDiff(args);
    case 'status':
    default:
      return handleStatus(args);
  }
}


// ── Persistance adaptive hors process ──────────────────────────────────────
let _superfetationRegistryPersistent = false;

function _ensuresuperfetationRegistryPersistent() {
  if (_superfetationRegistryPersistent || !adaptivePersister || !adaptivePersister.getAdaptivePersister) return;
  try {
    const persister = adaptivePersister.getAdaptivePersister();
    if (!persister) return;
    // Réhydrate depuis DB
    const stored = persister.getMcpBiomimicryRegistry ? persister.getMcpBiomimicryRegistry('mcp_bio::superfetation_pipeline', 'superfetationRegistry') : null;
    const mapToUse = stored && stored.size ? stored : superfetationRegistry;
    const persistentMap = persister.makePersistentMap ? persister.makePersistentMap('mcp_bio::superfetation_pipeline', 'superfetationRegistry', mapToUse) : mapToUse;
    // Remplacer la référence exportée par le proxy persistant
    Object.defineProperty(module.exports, 'superfetationRegistry', {
      value: persistentMap,
      writable: true,
      configurable: true
    });
    _superfetationRegistryPersistent = true;
  } catch (_) { /* best-effort */ }
}

function setAdaptivePersister(persister) {
  adaptivePersister.setAdaptivePersister && adaptivePersister.setAdaptivePersister(persister);
  _ensuresuperfetationRegistryPersistent();
}

function getAdaptivePersister() {
  return adaptivePersister;
}

function getSnapshot() {
  const map = module.exports.superfetationRegistry || superfetationRegistry;
  const obj = {};
  if (map instanceof Map) {
    for (const [k, v] of map.entries()) obj[k] = v;
  }
  return obj;
}

function onMutation(snapshot) {
  // La Map est déjà persistée par le proxy ; on ne fait rien de plus.
}

_ensuresuperfetationRegistryPersistent();

module.exports = {
  handle,
  SUPERFETATION_REGISTRY,
  setAdaptivePersister,
  getAdaptivePersister,
  getSnapshot,
  onMutation};
