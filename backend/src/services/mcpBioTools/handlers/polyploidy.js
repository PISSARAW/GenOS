// Registry for Genomic Polyploidy
const polyploidyRegistry = new Map(); /* persisterHook: polyploidyRegistry */

function getPolyploidyRecord(id) {
  if (!polyploidyRegistry.has(id)) {
    polyploidyRegistry.set(id, {
      id,
      ploidyLevel: 2, // 2n diploid by default
      ploidyName: 'Diploid (2n)',
      layers: [
        { layerIndex: 1, role: 'Executive Baseline', genomeHash: 'hash-layer-1' },
        { layerIndex: 2, role: 'Verification Mirror', genomeHash: 'hash-layer-2' }
      ],
      updatedAt: new Date().toISOString()
    });
  }
  return polyploidyRegistry.get(id);
}

function resolvePloidyName(level) {
  if (level === 3) return 'Triploid (3n)';
  if (level === 4) return 'Tetraploid (4n)';
  if (level === 6) return 'Hexaploid (6n - Wheat Strategy)';
  if (level === 8) return 'Octoploid (8n)';
  return `Polyploid (${level}n)`;
}

function handleMultiplyPloidy(record, polyId, level) {
  const targetLevel = Math.max(2, Math.min(8, level || 4));
  record.ploidyLevel = targetLevel;
  record.ploidyName = resolvePloidyName(targetLevel);
  record.layers = [];

  const defaultRoles = [
    'AST Core Logic',
    'Security & Permission Invariants',
    'Epistemic Formal Proof',
    'Heuristic Fuzzing',
    'Performance Optimization',
    'Explanatory Documentation & Specs',
    'Resilience Checkpoint Sentinel',
    'Telemetry & Homeostasis Monitor'
  ];

  for (let i = 0; i < targetLevel; i++) {
    record.layers.push({
      layerIndex: i + 1,
      role: defaultRoles[i] || `Auxiliary Layer #${i + 1}`,
      genomeHash: `poly-hash-layer-${i + 1}`
    });
  }
  record.updatedAt = new Date().toISOString();

  return {
    configured: true,
    success: true,
    status: 'ploidy_multiplied',
    transport: 'polyploidy_engine',
    polyploidy_id: polyId,
    ploidy_level: record.ploidyLevel,
    ploidy_name: record.ploidyName,
    layers_count: record.layers.length,
    layers: record.layers,
    output: `Genome ploidy multiplied to ${record.ploidyName} with ${record.layers.length} specialized functional layers.`
  };
}

function handleOrchestrateLayers(record, polyId) {
  const topology = record.layers.map(l => `[Layer ${l.layerIndex} (${l.role})]`).join(' <-> ');
  return {
    configured: true,
    success: true,
    status: 'polyploid_layers_orchestrated',
    transport: 'polyploidy_engine',
    polyploidy_id: polyId,
    ploidy_level: record.ploidyLevel,
    layers: record.layers,
    topology,
    output: `Polyploid multi-layer orchestration active: ${topology}.`
  };
}

function handlePolyploidy(args = {}) {
  const action = args.action || 'status';
  const polyId = args.id || `poly-${Date.now()}`;
  const record = getPolyploidyRecord(polyId);

  if (action === 'multiply_genome_ploidy') {
    return handleMultiplyPloidy(record, polyId, args.ploidy_level);
  }
  if (action === 'orchestrate_polyploid_layers') {
    return handleOrchestrateLayers(record, polyId);
  }

  return {
    configured: true,
    success: true,
    status: 'active',
    transport: 'polyploidy_engine',
    polyploidy_id: polyId,
    ploidy_level: record.ploidyLevel,
    ploidy_name: record.ploidyName,
    layers_count: record.layers.length,
    layers: record.layers,
    output: `Polyploidy engine '${polyId}' active (${record.ploidyName}).`
  };
}

function handlePolyploidyError(e) {
  return {
    configured: true,
    success: false,
    status: 'tool_error',
    transport: 'polyploidy_engine',
    output: e.message || 'Unknown polyploidy error'
  };
}


// ── Persistance adaptive hors process ──────────────────────────────────────
let _polyploidyRegistryPersistent = false;

function _ensurepolyploidyRegistryPersistent() {
  // require lazy pour éviter circularité
  const adaptivePersister = require('../../adaptiveStateBootstrap');
  if (_polyploidyRegistryPersistent || !adaptivePersister || !adaptivePersister.getAdaptivePersister) return;
  try {
    const persister = adaptivePersister.getAdaptivePersister();
    if (!persister) return;
    // Réhydrate depuis DB
    const stored = persister.getMcpBiomimicryRegistry ? persister.getMcpBiomimicryRegistry('mcp_bio::polyploidy', 'polyploidyRegistry') : null;
    const mapToUse = stored && stored.size ? stored : polyploidyRegistry;
    const persistentMap = persister.makePersistentMap ? persister.makePersistentMap('mcp_bio::polyploidy', 'polyploidyRegistry', mapToUse) : mapToUse;
    // Remplacer la référence exportée par le proxy persistant
    Object.defineProperty(module.exports, 'polyploidyRegistry', {
      value: persistentMap,
      writable: true,
      configurable: true
    });
    _polyploidyRegistryPersistent = true;
  } catch (_) { /* best-effort */ }
}

function setAdaptivePersister(persister) {
  const adaptivePersister = require('../../adaptiveStateBootstrap');
  adaptivePersister.setAdaptivePersister && adaptivePersister.setAdaptivePersister(persister);
  _ensurepolyploidyRegistryPersistent();
}

function getAdaptivePersister() {
  return require('../../adaptiveStateBootstrap');
}

function getSnapshot() {
  const map = module.exports.polyploidyRegistry || polyploidyRegistry;
  const obj = {};
  if (map instanceof Map) {
    for (const [k, v] of map.entries()) obj[k] = v;
  }
  return obj;
}

function onMutation(snapshot) {
  // La Map est déjà persistée par le proxy ; on ne fait rien de plus.
}

_ensurepolyploidyRegistryPersistent();

module.exports = {
  handlePolyploidy,
  handlePolyploidyError,
  polyploidyRegistry,
  setAdaptivePersister,
  getAdaptivePersister,
  getSnapshot,
  onMutation};
