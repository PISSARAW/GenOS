// Registry for Chromosomal Duplications
const chromosomalDuplicationRegistry = new Map(); /* persisterHook: chromosomalDuplicationRegistry */

// Plafond de copies en tandem par locus (anti-emballement).
const MAX_TANDEM_COPIES = 8;

function getDuplicationRecord(id) {
  if (!chromosomalDuplicationRegistry.has(id)) {
    chromosomalDuplicationRegistry.set(id, {
      id,
      segments: [
        { locus: 'LOCUS_REASONING_ENGINE', copyIndex: 1, heuristic: 'strict_deductive', isNeoFunctionalized: false }
      ],
      // Compteur monotonique : jamais réutilisé après suppression (anti-collision).
      nextCopyIndex: 2,
      updatedAt: new Date().toISOString()
    });
  }
  const record = chromosomalDuplicationRegistry.get(id);
  if (record.nextCopyIndex === undefined) {
    const maxSeen = record.segments.reduce((m, s) => Math.max(m, s.copyIndex || 1), 1);
    record.nextCopyIndex = maxSeen + 1;
  }
  return record;
}

function duplicateSegment(record, targetLocus) {
  const existing = record.segments.filter(s => s.locus === targetLocus);
  if (existing.length === 0) {
    return { success: false, msg: `Locus '${targetLocus}' not found.` };
  }
  // Plafond : refuse au-delà de MAX_TANDEM_COPIES copies.
  if (existing.length >= MAX_TANDEM_COPIES) {
    return { success: false, capped: true, totalCopies: existing.length, msg: `Refused: '${targetLocus}' already at cap (${MAX_TANDEM_COPIES} copies).` };
  }
  const nextCopyIndex = record.nextCopyIndex;
  record.nextCopyIndex += 1;
  const newSegment = {
    locus: targetLocus,
    copyIndex: nextCopyIndex,
    heuristic: existing[0].heuristic,
    isNeoFunctionalized: false
  };
  record.segments.push(newSegment);
  record.updatedAt = new Date().toISOString();
  return { success: true, newSegment, totalCopies: nextCopyIndex, msg: `Duplicated '${targetLocus}' in tandem (Copy #${nextCopyIndex}).` };
}

function neofunctionalizeSegment(record, params) {
  const { targetLocus, copyIndex, newHeuristic } = params;
  const target = record.segments.find(s => s.locus === targetLocus && s.copyIndex === (copyIndex || 2));
  if (!target) {
    return { success: false, msg: `Duplicated copy of '${targetLocus}' not found.` };
  }
  target.heuristic = newHeuristic || 'creative_divergent';
  target.isNeoFunctionalized = true;
  record.updatedAt = new Date().toISOString();
  return { success: true, target, msg: `Copy #${target.copyIndex} neo-functionalized to '${target.heuristic}'.` };
}

function handleDuplicateAction(record, dupId, args) {
  const targetLocus = args.target_locus || 'LOCUS_REASONING_ENGINE';
  const res = duplicateSegment(record, targetLocus);
  return {
    configured: true,
    success: res.success,
    status: res.success ? 'segment_duplicated' : (res.capped ? 'copy_cap_reached' : 'locus_not_found'),
    transport: 'chromosomal_duplication_engine',
    duplication_id: dupId,
    target_locus: targetLocus,
    total_copies: res.totalCopies || 1,
    segments: record.segments,
    output: res.msg
  };
}

function handleDivergeAction(record, dupId, args) {
  const params = {
    targetLocus: args.target_locus || 'LOCUS_REASONING_ENGINE',
    copyIndex: args.copy_index || 2,
    newHeuristic: args.new_heuristic || 'creative_divergent'
  };
  const res = neofunctionalizeSegment(record, params);
  return {
    configured: true,
    success: res.success,
    status: res.success ? 'copy_diverged' : 'copy_not_found',
    transport: 'chromosomal_duplication_engine',
    duplication_id: dupId,
    target_locus: params.targetLocus,
    segments: record.segments,
    output: res.msg
  };
}

function handleChromosomalDuplication(args = {}) {
  const action = args.action || 'status';
  const dupId = args.id || `dup-${Date.now()}`;
  const record = getDuplicationRecord(dupId);

  if (action === 'duplicate_chromosome_segment') {
    return handleDuplicateAction(record, dupId, args);
  }
  if (action === 'diverge_duplicated_branch') {
    return handleDivergeAction(record, dupId, args);
  }

  return {
    configured: true,
    success: true,
    status: 'active',
    transport: 'chromosomal_duplication_engine',
    duplication_id: dupId,
    total_segments: record.segments.length,
    segments: record.segments,
    output: `Duplication engine '${dupId}' active with ${record.segments.length} segment copy(ies).`
  };
}

function handleChromosomalDuplicationError(e) {
  return {
    configured: true,
    success: false,
    status: 'tool_error',
    transport: 'chromosomal_duplication_engine',
    output: e.message || 'Unknown chromosomal duplication error'
  };
}


// ── Persistance adaptive hors process ──────────────────────────────────────
let _chromosomalDuplicationRegistryPersistent = false;

function _ensurechromosomalDuplicationRegistryPersistent() {
  // require lazy pour éviter circularité
  const adaptivePersister = require('../../adaptiveStateBootstrap');
  if (_chromosomalDuplicationRegistryPersistent || !adaptivePersister || !adaptivePersister.getAdaptivePersister) return;
  try {
    const persister = adaptivePersister.getAdaptivePersister();
    if (!persister) return;
    // Réhydrate depuis DB
    const stored = persister.getMcpBiomimicryRegistry ? persister.getMcpBiomimicryRegistry('mcp_bio::chromosomal_duplication', 'chromosomalDuplicationRegistry') : null;
    const mapToUse = stored && stored.size ? stored : chromosomalDuplicationRegistry;
    const persistentMap = persister.makePersistentMap ? persister.makePersistentMap('mcp_bio::chromosomal_duplication', 'chromosomalDuplicationRegistry', mapToUse) : mapToUse;
    // Remplacer la référence exportée par le proxy persistant
    Object.defineProperty(module.exports, 'chromosomalDuplicationRegistry', {
      value: persistentMap,
      writable: true,
      configurable: true
    });
    _chromosomalDuplicationRegistryPersistent = true;
  } catch (_) { /* best-effort */ }
}

function setAdaptivePersister(persister) {
  const adaptivePersister = require('../../adaptiveStateBootstrap');
  adaptivePersister.setAdaptivePersister && adaptivePersister.setAdaptivePersister(persister);
  _ensurechromosomalDuplicationRegistryPersistent();
}

function getAdaptivePersister() {
  return require('../../adaptiveStateBootstrap');
}

function getSnapshot() {
  const map = module.exports.chromosomalDuplicationRegistry || chromosomalDuplicationRegistry;
  const obj = {};
  if (map instanceof Map) {
    for (const [k, v] of map.entries()) obj[k] = v;
  }
  return obj;
}

function onMutation(snapshot) {
  // La Map est déjà persistée par le proxy ; on ne fait rien de plus.
}

_ensurechromosomalDuplicationRegistryPersistent();

module.exports = {
  handleChromosomalDuplication,
  handleChromosomalDuplicationError,
  chromosomalDuplicationRegistry,
  setAdaptivePersister,
  getAdaptivePersister,
  getSnapshot,
  onMutation};
