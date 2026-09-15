// Registry for Genomic Aneuploidy
const aneuploidyRegistry = new Map(); /* persisterHook: aneuploidyRegistry */

function getAneuploidyRecord(id) {
  if (!aneuploidyRegistry.has(id)) {
    aneuploidyRegistry.set(id, {
      id,
      karyotype: {
        chrom_analyzer: 2, // default diploid
        chrom_verifier: 2,
        chrom_executor: 2
      },
      updatedAt: new Date().toISOString()
    });
  }
  return aneuploidyRegistry.get(id);
}

function handleTrisomyAction(record, aneId, targetChrom) {
  record.karyotype[targetChrom] = 3;
  record.updatedAt = new Date().toISOString();
  return {
    configured: true,
    success: true,
    status: 'trisomy_induced',
    transport: 'aneuploidy_engine',
    aneuploidy_id: aneId,
    target_chromosome: targetChrom,
    copy_count: 3,
    karyotype: record.karyotype,
    output: `Induced trisomy (+1 copy) on '${targetChrom}'. 3 instances ready for 2/3 majority arbitration.`
  };
}

function handleMonosomyAction(record, aneId, targetChrom) {
  record.karyotype[targetChrom] = 1;
  record.updatedAt = new Date().toISOString();
  return {
    configured: true,
    success: true,
    status: 'monosomy_induced',
    transport: 'aneuploidy_engine',
    aneuploidy_id: aneId,
    target_chromosome: targetChrom,
    copy_count: 1,
    karyotype: record.karyotype,
    output: `Induced monosomy (-1 copy) on '${targetChrom}'. 1 instance active for frugal execution.`
  };
}

function handleConsensusAction(args) {
  const votes = Array.isArray(args.votes) ? args.votes : ['APPROVE', 'APPROVE', 'REJECT'];
  const counts = {};
  for (const v of votes) {
    counts[v] = (counts[v] || 0) + 1;
  }
  let winner = null;
  let maxCount = 0;
  for (const [v, cnt] of Object.entries(counts)) {
    if (cnt > maxCount) {
      maxCount = cnt;
      winner = v;
    }
  }
  const isSupermajority = maxCount >= Math.ceil((2 / 3) * votes.length);
  return {
    configured: true,
    success: true,
    status: 'trisomic_consensus_resolved',
    transport: 'aneuploidy_engine',
    votes,
    winner,
    majority_count: maxCount,
    supermajority_achieved: isSupermajority,
    output: `Trisomic consensus resolved: winner='${winner}' with ${maxCount}/${votes.length} votes (Supermajority: ${isSupermajority}).`
  };
}

function handleAneuploidy(args = {}) {
  const action = args.action || 'status';
  const aneId = args.id || `aneu-${Date.now()}`;
  const targetChrom = args.target_chromosome || 'chrom_verifier';
  const record = getAneuploidyRecord(aneId);

  if (action === 'induce_trisomy') {
    return handleTrisomyAction(record, aneId, targetChrom);
  }
  if (action === 'induce_monosomy') {
    return handleMonosomyAction(record, aneId, targetChrom);
  }
  if (action === 'resolve_aneuploid_consensus') {
    return handleConsensusAction(args);
  }

  return {
    configured: true,
    success: true,
    status: 'active',
    transport: 'aneuploidy_engine',
    aneuploidy_id: aneId,
    karyotype: record.karyotype,
    output: `Aneuploidy engine '${aneId}' active. Karyotype: ${JSON.stringify(record.karyotype)}.`
  };
}

function handleAneuploidyError(e) {
  return {
    configured: true,
    success: false,
    status: 'tool_error',
    transport: 'aneuploidy_engine',
    output: e.message || 'Unknown aneuploidy error'
  };
}


// ── Persistance adaptive hors process ──────────────────────────────────────
let _aneuploidyRegistryPersistent = false;

function _ensureaneuploidyRegistryPersistent() {
  // require lazy pour éviter circularité
  const adaptivePersister = require('../../adaptiveStateBootstrap');
  if (_aneuploidyRegistryPersistent || !adaptivePersister || !adaptivePersister.getAdaptivePersister) return;
  try {
    const persister = adaptivePersister.getAdaptivePersister();
    if (!persister) return;
    // Réhydrate depuis DB
    const stored = persister.getMcpBiomimicryRegistry ? persister.getMcpBiomimicryRegistry('mcp_bio::aneuploidy', 'aneuploidyRegistry') : null;
    const mapToUse = stored && stored.size ? stored : aneuploidyRegistry;
    const persistentMap = persister.makePersistentMap ? persister.makePersistentMap('mcp_bio::aneuploidy', 'aneuploidyRegistry', mapToUse) : mapToUse;
    // Remplacer la référence exportée par le proxy persistant
    Object.defineProperty(module.exports, 'aneuploidyRegistry', {
      value: persistentMap,
      writable: true,
      configurable: true
    });
    _aneuploidyRegistryPersistent = true;
  } catch (_) { /* best-effort */ }
}

function setAdaptivePersister(persister) {
  const adaptivePersister = require('../../adaptiveStateBootstrap');
  adaptivePersister.setAdaptivePersister && adaptivePersister.setAdaptivePersister(persister);
  _ensureaneuploidyRegistryPersistent();
}

function getAdaptivePersister() {
  return require('../../adaptiveStateBootstrap');
}

function getSnapshot() {
  const map = module.exports.aneuploidyRegistry || aneuploidyRegistry;
  const obj = {};
  if (map instanceof Map) {
    for (const [k, v] of map.entries()) obj[k] = v;
  }
  return obj;
}

function onMutation(snapshot) {
  // La Map est déjà persistée par le proxy ; on ne fait rien de plus.
}

_ensureaneuploidyRegistryPersistent();

module.exports = {
  handleAneuploidy,
  handleAneuploidyError,
  aneuploidyRegistry,
  setAdaptivePersister,
  getAdaptivePersister,
  getSnapshot,
  onMutation};
