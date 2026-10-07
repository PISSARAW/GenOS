// Registry for Frameshift (Indel) mutations
let frameshiftRegistry = new Map();

function getFrameshiftRecord(id) {
  if (!frameshiftRegistry.has(id)) {
    frameshiftRegistry.set(id, {
      id,
      readingFrameShift: 0,
      sequenceTokens: ['INIT_COD', 'STAGE_ANALYZE', 'STAGE_EXEC', 'TERM_COD'],
      isSynchronized: true,
      updatedAt: new Date().toISOString()
    });
  }
  return frameshiftRegistry.get(id);
}

function processIndel(record, params) {
  const { isInsert, token, position } = params;
  const pos = Math.max(0, Math.min(record.sequenceTokens.length, position || 0));
  if (isInsert) {
    record.sequenceTokens.splice(pos, 0, token || 'INDEL_PAD');
    record.readingFrameShift = (record.readingFrameShift + 1) % 3;
  } else {
    if (record.sequenceTokens.length > 0) {
      record.sequenceTokens.splice(pos, 1);
      record.readingFrameShift = (record.readingFrameShift + 2) % 3; // -1 mod 3
    }
  }
  record.isSynchronized = (record.readingFrameShift === 0);
  record.updatedAt = new Date().toISOString();
}

function computeCodons(tokens) {
  const codons = [];
  for (let i = 0; i < tokens.length; i += 3) {
    codons.push(tokens.slice(i, i + 3).join('-'));
  }
  return codons;
}

function frameshiftInsertResult(args, record, shiftId) {
  processIndel(record, { isInsert: true, token: args.token, position: args.position });
  return {
    configured: true,
    success: true,
    status: 'insertion_frameshift_applied',
    execution_scope: 'metadata_simulation',
    runtime_effect_applied: false,
    transport: 'frameshift_engine',
    shift_id: shiftId,
    frame_shift_offset: record.readingFrameShift,
    is_synchronized: record.isSynchronized,
    codons: computeCodons(record.sequenceTokens),
    output: `Simulation inserted a token and shifted its model frame by +1 (offset ${record.readingFrameShift}, sync=${record.isSynchronized}); runtime behavior is unchanged.`
  };
}

function frameshiftDeleteResult(args, record, shiftId) {
  processIndel(record, { isInsert: false, position: args.position });
  return {
    configured: true,
    success: true,
    status: 'deletion_frameshift_applied',
    execution_scope: 'metadata_simulation',
    runtime_effect_applied: false,
    transport: 'frameshift_engine',
    shift_id: shiftId,
    frame_shift_offset: record.readingFrameShift,
    is_synchronized: record.isSynchronized,
    codons: computeCodons(record.sequenceTokens),
    output: `Simulation deleted a token and shifted its model frame by -1 (offset ${record.readingFrameShift}, sync=${record.isSynchronized}); runtime behavior is unchanged.`
  };
}

function frameshiftRealignResult(record, shiftId) {
  const padNeeded = (3 - record.readingFrameShift) % 3;
  for (let i = 0; i < padNeeded; i++) {
    record.sequenceTokens.push(`COMPENSATORY_PAD_${i + 1}`);
  }
  record.readingFrameShift = 0;
  record.isSynchronized = true;
  record.updatedAt = new Date().toISOString();
  return {
    configured: true,
    success: true,
    status: 'reading_frame_realigned',
    execution_scope: 'metadata_simulation',
    runtime_effect_applied: false,
    transport: 'frameshift_engine',
    shift_id: shiftId,
    pads_inserted: padNeeded,
    is_synchronized: true,
    codons: computeCodons(record.sequenceTokens),
    output: `Reading frame realigned with ${padNeeded} compensatory pad(s). Synchronization restored.`
  };
}

function frameshiftStatusResult(record, shiftId) {
  return {
      configured: true,
      success: true,
      status: 'active',
      execution_scope: 'metadata_simulation',
      runtime_effect_applied: false,
    transport: 'frameshift_engine',
    shift_id: shiftId,
    frame_shift_offset: record.readingFrameShift,
    is_synchronized: record.isSynchronized,
    codons: computeCodons(record.sequenceTokens),
    output: `Frameshift engine '${shiftId}' active: offset=${record.readingFrameShift}, sync=${record.isSynchronized}.`
  };
}

function handleFrameshiftMutation(args = {}) {
  const action = args.action || 'status';
  const shiftId = args.id || `mut-shift-${Date.now()}`;
  const record = getFrameshiftRecord(shiftId);
  if (action === 'insert_token_frameshift') {
    const position = args.position === undefined ? 0 : args.position;
    if (handleFrameshiftMutationCondition2(position, record)) {
      return { configured: true, success: false, status: 'invalid_args', error: 'position must be an integer from 0 through sequence length.' };
    }
    return frameshiftInsertResult(args, record, shiftId);
  }
  if (action === 'delete_token_frameshift') {
    const position = args.position === undefined ? 0 : args.position;
    if (handleFrameshiftMutationCondition(position, record)) {
      return { configured: true, success: false, status: 'invalid_args', error: 'position must identify an existing token.' };
    }
    return frameshiftDeleteResult(args, record, shiftId);
  }
  if (action === 'realign_reading_frame') {
    return frameshiftRealignResult(record, shiftId);
  }
  return frameshiftStatusResult(record, shiftId);
}

function handleFrameshiftMutationError(e) {
  return {
    configured: true,
    success: false,
    status: 'tool_error',
    transport: 'frameshift_engine',
    output: e.message || 'Unknown frameshift error'
  };
}


// ── Persistance adaptive hors process ──────────────────────────────────────
let _frameshiftMutationRegistryPersistent = false;

function _ensureframeshiftMutationRegistryPersistent() {
  // require lazy pour éviter circularité
  const adaptivePersister = require('../../adaptiveStateBootstrap');
  if (_frameshiftMutationRegistryPersistent || !adaptivePersister || !adaptivePersister.getAdaptivePersister) return;
  try {
    const persister = adaptivePersister.getAdaptivePersister();
    if (!persister) return;
    // Réhydrate depuis DB
    const stored = persister.getMcpBiomimicryRegistry ? persister.getMcpBiomimicryRegistry('mcp_bio::frameshift_mutation', 'frameshiftMutationRegistry') : null;
    const mapToUse = stored && stored.size ? stored : frameshiftRegistry;
    const persistentMap = persister.makePersistentMap ? persister.makePersistentMap('mcp_bio::frameshift_mutation', 'frameshiftMutationRegistry', mapToUse) : mapToUse;
    // Remplacer la référence exportée par le proxy persistant
    frameshiftRegistry = persistentMap;
    Object.defineProperty(module.exports, 'frameshiftRegistry', {
      value: persistentMap,
      writable: true,
      configurable: true
    });
    _frameshiftMutationRegistryPersistent = true;
  } catch (_) { /* best-effort */ }
}

function setAdaptivePersister(persister) {
  const adaptivePersister = require('../../adaptiveStateBootstrap');
  adaptivePersister.setAdaptivePersister && adaptivePersister.setAdaptivePersister(persister);
  _ensureframeshiftMutationRegistryPersistent();
}

function getAdaptivePersister() {
  return require('../../adaptiveStateBootstrap');
}

function getSnapshot() {
  const map = module.exports.frameshiftRegistry || frameshiftRegistry;
  const obj = {};
  if (map instanceof Map) {
    for (const [k, v] of map.entries()) obj[k] = v;
  }
  return obj;
}

function onMutation(snapshot) {
  // La Map est déjà persistée par le proxy ; on ne fait rien de plus.
}

_ensureframeshiftMutationRegistryPersistent();

module.exports = {
  handleFrameshiftMutation,
  handleFrameshiftMutationError,
  frameshiftRegistry,
  setAdaptivePersister,
  getAdaptivePersister,
  getSnapshot,
  onMutation};

function handleFrameshiftMutationCondition(position, record) {
  return !Number.isSafeInteger(position) || position < 0 || position >= record.sequenceTokens.length;
}

function handleFrameshiftMutationCondition2(position, record) {
  return !Number.isSafeInteger(position) || position < 0 || position > record.sequenceTokens.length;
}
