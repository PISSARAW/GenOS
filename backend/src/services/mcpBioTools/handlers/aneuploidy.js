// Registry for Genomic Aneuploidy
const aneuploidyRegistry = new Map(); /* persisterHook: aneuploidyRegistry */
const VALID_CHROMOSOMES = new Set(['chrom_analyzer', 'chrom_verifier', 'chrom_executor']);

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
    execution_scope: 'metadata_simulation',
    runtime_genome_changed: false,
    output: `Recorded trisomy metadata (+1 copy) on '${targetChrom}'. No runtime genome was changed.`
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
    execution_scope: 'metadata_simulation',
    runtime_genome_changed: false,
    output: `Recorded monosomy metadata (-1 copy) on '${targetChrom}'. No runtime genome was changed.`
  };
}

function handleConsensusAction(args) {
  const votes = args.votes === undefined ? ['APPROVE', 'APPROVE', 'REJECT'] : args.votes;
  if (!Array.isArray(votes) || votes.length === 0 || votes.length > 128 ||
      !votes.every(v => typeof v === 'string' && v.trim().length > 0 && v.length <= 128)) {
    return { configured: true, success: false, status: 'invalid_args', error: 'votes must contain 1 to 128 non-empty strings (max 128 chars each).' };
  }
  const counts = new Map();
  for (const v of votes) counts.set(v, (counts.get(v) || 0) + 1);
  let winner = null;
  let maxCount = 0;
  for (const [v, cnt] of counts) {
    if (cnt > maxCount) {
      maxCount = cnt;
      winner = v;
    }
  }
  const hasMajority = maxCount > votes.length / 2;
  const isSupermajority = hasMajority && maxCount >= Math.ceil((2 / 3) * votes.length);
  return {
    configured: true,
    success: true,
    status: 'trisomic_consensus_resolved',
    transport: 'aneuploidy_engine',
    votes,
    winner: hasMajority ? winner : null,
    majority_count: maxCount,
    supermajority_achieved: isSupermajority,
    execution_scope: 'metadata_simulation',
    output: `Vote tally recorded: winner='${winner}' with ${maxCount}/${votes.length} votes (strict supermajority: ${isSupermajority}). No runtime arbitration occurred.`
  };
}

function handleAneuploidy(args = {}) {
  const action = args.action || 'status';
  const aneId = args.id || `aneu-${Date.now()}`;
  const targetChrom = args.target_chromosome || 'chrom_verifier';
  if (typeof aneId !== 'string' || !aneId.trim() || aneId.length > 120 || typeof targetChrom !== 'string' || !VALID_CHROMOSOMES.has(targetChrom)) {
    return { configured: true, success: false, status: 'invalid_args', error: 'id must be a non-empty string (max 120 chars); target_chromosome must be a known karyotype key.' };
  }
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
    execution_scope: 'metadata_simulation',
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
