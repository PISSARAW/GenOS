/**
 * Biomimicry Handler: Marmoset Germline Chimerism (Chimérisme Germinal du Ouistiti)
 *
 * Simulates fraternal stem-cell sharing where an agent twin can procreate on behalf
 * of its sibling, passing the sibling's genetic payload into a new descendant.
 */

const crypto = require('crypto');
const { createRelation, stableRelationId } = require('../../crossAgentRelationalService');

// In-memory registry of marmoset germline chimerism records
const MARMOSET_REGISTRY = new Map();

function generateId(prefix) {
  return `${prefix}_${Math.random().toString(36).substring(2, 9)}`;
}

function computeHash(data) {
  return crypto.createHash('sha256').update(JSON.stringify(data || {})).digest('hex').substring(0, 16);
}

async function handleExchange(args) {
  const donorTwinId = args.donor_twin_id || 'twin_donor_alpha';
  const proxyTwinId = args.proxy_twin_id || 'twin_proxy_beta';
  const germlinePayload = args.germline_payload || {
    discovered_heuristics: ['opt_algorithm_v3', 'memory_safe_buffers'],
    epigenetic_markers: { fitness_score: 0.96 }
  };

  const exchangeId = generateId('marmoset_exchange');
  const payloadChecksum = computeHash(germlinePayload);

  const record = {
    exchangeId,
    donorTwinId,
    proxyTwinId,
    germlinePayload,
    payloadChecksum,
    descendants: [],
    createdAt: new Date().toISOString()
  };

  await createRelation({
    id: stableRelationId('chimera', `marmoset-exchange:${exchangeId}`),
    sourceAgentId: donorTwinId,
    targetAgentId: proxyTwinId,
    relationType: 'chimera',
    organizationId: args.organization_id,
    projectId: args.project_id,
    metadata: { exchangeId, subtype: 'germline_proxy', payloadChecksum }
  });

  MARMOSET_REGISTRY.set(exchangeId, record);

  return {
    configured: true,
    success: true,
    status: 'germline_chimerism_exchanged',
    exchange_id: exchangeId,
    donor_twin: donorTwinId,
    proxy_twin: proxyTwinId,
    germline_checksum: payloadChecksum,
    output: `Proxy twin [${proxyTwinId}] successfully colonized by germline cells from [${donorTwinId}].`
  };
}

async function handleSpawnProxy(args) {
  const exchangeId = args.exchange_id;
  const childGoal = args.child_task_goal || 'continuation_task';
  const record = MARMOSET_REGISTRY.get(exchangeId);

  if (!record) {
    return {
      configured: true,
      success: false,
      status: 'not_found',
      error: `Germline exchange record [${exchangeId}] not found.`
    };
  }

  const childId = generateId('marmoset_descendant');
  const childRecord = {
    childId,
    geneticParentId: record.donorTwinId,
    proxyParentId: record.proxyTwinId,
    taskGoal: childGoal,
    inheritedGermline: record.germlinePayload,
    germlineChecksum: record.payloadChecksum,
    spawnedAt: new Date().toISOString()
  };

  await Promise.all([
    createRelation({
      id: stableRelationId('parent', `marmoset:${childId}:${record.donorTwinId}`), sourceAgentId: record.donorTwinId,
      targetAgentId: childId, relationType: 'parent', organizationId: args.organization_id, projectId: args.project_id,
      metadata: { exchangeId, subtype: 'genetic_donor', germlineChecksum: record.payloadChecksum }
    }),
    createRelation({
      id: stableRelationId('parent', `marmoset:${childId}:${record.proxyTwinId}`), sourceAgentId: record.proxyTwinId,
      targetAgentId: childId, relationType: 'parent', organizationId: args.organization_id, projectId: args.project_id,
      metadata: { exchangeId, subtype: 'gestational_proxy', germlineChecksum: record.payloadChecksum }
    })
  ]);

  record.descendants.push(childRecord);

  return {
    configured: true,
    success: true,
    status: 'proxy_descendant_spawned',
    child_agent_id: childId,
    genetic_donor_parent: record.donorTwinId,
    gestational_proxy_parent: record.proxyTwinId,
    germline_checksum: record.payloadChecksum,
    output: `Child [${childId}] spawned by proxy [${record.proxyTwinId}] carrying 100% germline DNA of [${record.donorTwinId}].`
  };
}

function handleInspect(args) {
  const childId = args.child_agent_id;
  for (const record of MARMOSET_REGISTRY.values()) {
    const match = record.descendants.find(d => d.childId === childId);
    if (match) {
      return {
        configured: true,
        success: true,
        status: 'heritage_verified',
        child_id: match.childId,
        genetic_parent: match.geneticParentId,
        proxy_parent: match.proxyParentId,
        checksum: match.germlineChecksum,
        inherited_heuristics: match.inheritedGermline.discovered_heuristics || []
      };
    }
  }

  return {
    configured: true,
    success: false,
    status: 'not_found',
    error: `Descendant [${childId}] not found in marmoset registry.`
  };
}

function handleStatus(args) {
  const exchangeId = args.exchange_id;
  if (exchangeId) {
    const record = MARMOSET_REGISTRY.get(exchangeId);
    if (!record) return { configured: true, success: false, error: 'Not found' };
    return { configured: true, success: true, exchange: record };
  }

  const allExchanges = Array.from(MARMOSET_REGISTRY.values()).map(r => ({
    exchangeId: r.exchangeId,
    donor: r.donorTwinId,
    proxy: r.proxyTwinId,
    descendantsCount: r.descendants.length
  }));

  return {
    configured: true,
    success: true,
    total_exchanges: allExchanges.length,
    exchanges: allExchanges
  };
}

async function handle(args, run) {
  const action = (args && args.action) || 'status';

  switch (action) {
    case 'exchange_germline_payload':
      return await handleExchange(args);
    case 'spawn_proxy_descendant':
      return await handleSpawnProxy(args);
    case 'inspect_germline_heritage':
      return handleInspect(args);
    case 'status':
    default:
      return handleStatus(args);
  }
}


// ── Persistance adaptive hors process ──────────────────────────────────────
let _marmosetGermlineRegistryPersistent = false;

function _ensuremarmosetGermlineRegistryPersistent() {
  // require lazy pour éviter circularité
  const adaptivePersister = require('../../adaptiveStateBootstrap');
  if (_marmosetGermlineRegistryPersistent || !adaptivePersister || !adaptivePersister.getAdaptivePersister) return;
  try {
    const persister = adaptivePersister.getAdaptivePersister();
    if (!persister) return;
    // Réhydrate depuis DB
    const stored = persister.getMcpBiomimicryRegistry ? persister.getMcpBiomimicryRegistry('mcp_bio::marmoset_germline_chimerism', 'marmosetGermlineRegistry') : null;
    const mapToUse = stored && stored.size ? stored : marmosetGermlineRegistry;
    const persistentMap = persister.makePersistentMap ? persister.makePersistentMap('mcp_bio::marmoset_germline_chimerism', 'marmosetGermlineRegistry', mapToUse) : mapToUse;
    // Remplacer la référence exportée par le proxy persistant
    Object.defineProperty(module.exports, 'marmosetGermlineRegistry', {
      value: persistentMap,
      writable: true,
      configurable: true
    });
    _marmosetGermlineRegistryPersistent = true;
  } catch (_) { /* best-effort */ }
}

function setAdaptivePersister(persister) {
  const adaptivePersister = require('../../adaptiveStateBootstrap');
  adaptivePersister.setAdaptivePersister && adaptivePersister.setAdaptivePersister(persister);
  _ensuremarmosetGermlineRegistryPersistent();
}

function getAdaptivePersister() {
  return require('../../adaptiveStateBootstrap');
}

function getSnapshot() {
  const map = module.exports.marmosetGermlineRegistry || marmosetGermlineRegistry;
  const obj = {};
  if (map instanceof Map) {
    for (const [k, v] of map.entries()) obj[k] = v;
  }
  return obj;
}

function onMutation(snapshot) {
  // La Map est déjà persistée par le proxy ; on ne fait rien de plus.
}

_ensuremarmosetGermlineRegistryPersistent();

module.exports = {
  handle,
  MARMOSET_REGISTRY,
  setAdaptivePersister,
  getAdaptivePersister,
  getSnapshot,
  onMutation};
