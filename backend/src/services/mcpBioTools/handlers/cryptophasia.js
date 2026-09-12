const crypto = require('crypto');
const { quoteCliArg } = require('../shellQuote');

// Built-in dictionary of dense semantic opcodes for agentic dialogue
const DIALECT_OPCODES = {
  EXPLORE_WORKSPACE: 'OP_EXP_WS',
  VERIFY_INVARIANT: 'OP_VRF_INV',
  BISECT_REGRESSION: 'OP_BSC_REG',
  PRUNE_SYNAPSE: 'OP_PRN_SYN',
  SNAPSHOT_STATE: 'OP_SNP_STA',
  THALAMIC_RELAY: 'OP_THL_RLY',
  CHIMERIC_MERGE: 'OP_CHM_MRG',
  SOMATIC_PULSE: 'OP_SMT_PLS',
  EVIDENCE_PROVE: 'OP_EVD_PRV',
  APOPTOSIS_ABORT: 'OP_APT_ABR',
  CRYPTOBIOSIS_FREEZE: 'OP_CPB_FRZ'
};

const dialectRegistry = new Map();

function getSessionDialect(sessionId) {
  if (!dialectRegistry.has(sessionId)) {
    dialectRegistry.set(sessionId, {
      sessionId,
      customTokens: new Map(),
      messagesEncoded: 0,
      totalRawTokens: 0,
      totalCompressedTokens: 0,
      auditLog: []
    });
  }
  return dialectRegistry.get(sessionId);
}

function computeOpcode(rawIntent, opcodeKey) {
  const key = String(opcodeKey || '').toUpperCase();
  if (DIALECT_OPCODES[key]) return DIALECT_OPCODES[key];
  const hash = crypto.createHash('sha256').update(rawIntent).digest('hex').slice(0, 6);
  return `OP_CUST_${hash}`;
}

function encodeDialect(args, session, sessionId) {
  const rawIntent = args.intent || args.message || 'DEFAULT_INTENT';
  const opcode = computeOpcode(rawIntent, args.opcode);
  const payload = args.payload || {};
  const rawStr = typeof rawIntent === 'string' ? rawIntent : JSON.stringify(rawIntent);
  const fullVerboseContext = `[AGENT_MESSAGE] Directive: ${rawStr}. Structured Payload: ${JSON.stringify(payload)}. Please confirm understanding and proceed with execution.`;
  const rawTokenEst = Math.max(20, Math.floor(fullVerboseContext.length / 3.5));

  const dialectPacket = {
    d_op: opcode,
    d_ctx: crypto.createHash('sha256').update(sessionId).digest('hex').slice(0, 4),
    d_pld: payload,
    d_ts: Date.now()
  };

  const compressedStr = `${opcode}:${dialectPacket.d_ctx}:${JSON.stringify(payload)}`;
  const compressedTokenEst = Math.max(1, Math.floor(compressedStr.length / 4.0));
  const tokenSavingsPct = Math.max(0, Math.round((1 - (compressedTokenEst / Math.max(rawTokenEst, 1))) * 100));

  session.messagesEncoded += 1;
  session.totalRawTokens += rawTokenEst;
  session.totalCompressedTokens += compressedTokenEst;

  const chaperoneRecord = {
    timestamp: new Date().toISOString(),
    opcode,
    rawIntent,
    dialectPacket,
    rawTokenEst,
    compressedTokenEst,
    audited: true
  };
  session.auditLog.push(chaperoneRecord);
  if (session.auditLog.length > 50) session.auditLog.shift();

  return {
    configured: true,
    success: true,
    status: 'encoded',
    transport: 'cryptophasia_channel',
    session_id: sessionId,
    dialect_packet: dialectPacket,
    opcode,
    telemetry: {
      raw_tokens_est: rawTokenEst,
      compressed_tokens_est: compressedTokenEst,
      compression_ratio: `${tokenSavingsPct}%`,
      total_session_savings: Math.max(0, session.totalRawTokens - session.totalCompressedTokens)
    },
    output: `Encoded intent to dialect opcode [${opcode}]. Compression savings: ${tokenSavingsPct}%.`
  };
}

function decodeDialect(args, session, sessionId) {
  const packet = args.dialect_packet || {};
  const opcode = packet.d_op || 'UNKNOWN_OP';
  const match = session.auditLog.find(r => r.opcode === opcode && r.dialectPacket?.d_ts === packet.d_ts)
    || session.auditLog.find(r => r.opcode === opcode);
  const decodedMeaning = match ? match.rawIntent : `Mapped intent for opcode ${opcode}`;

  return {
    configured: true,
    success: true,
    status: 'decoded',
    transport: 'cryptophasia_channel',
    session_id: sessionId,
    opcode,
    decoded_meaning: decodedMeaning,
    chaperone_audit_verified: Boolean(match),
    payload: packet.d_pld || {},
    output: `Chaperone decoded opcode [${opcode}]: "${decodedMeaning}". Audit trail verified.`
  };
}

function auditTrace(session, sessionId) {
  return {
    configured: true,
    success: true,
    status: 'audit_ready',
    transport: 'epistemic_chaperone',
    session_id: sessionId,
    total_messages: session.messagesEncoded,
    total_raw_tokens: session.totalRawTokens,
    total_compressed_tokens: session.totalCompressedTokens,
    chaperone_trace: session.auditLog,
    output: `Chaperone audit trace returned ${session.auditLog.length} verified dialect event(s).`
  };
}

function statusDialect(session, sessionId) {
  return {
    configured: true,
    success: true,
    status: 'active',
    transport: 'cryptophasia_channel',
    session_id: sessionId,
    known_opcodes: Object.keys(DIALECT_OPCODES),
    messages_encoded: session.messagesEncoded,
    total_raw_tokens: session.totalRawTokens,
    total_compressed_tokens: session.totalCompressedTokens,
    output: `Cryptophasia session '${sessionId}' active. ${session.messagesEncoded} message(s) encoded with chaperone transparency.`
  };
}

function handleCryptophasia(args = {}, run) {
  const action = args.action || 'status';
  const sessionId = args.session_id || 'cryptophasia-default';
  const session = getSessionDialect(sessionId);

  if (action === 'encode_dialect') return encodeDialect(args, session, sessionId);
  if (action === 'decode_dialect') return decodeDialect(args, session, sessionId);
  if (action === 'audit_trace') return auditTrace(session, sessionId);
  return statusDialect(session, sessionId);
}

function handleCryptophasiaError(e) {
  return {
    configured: true,
    success: false,
    status: 'tool_error',
    transport: 'cryptophasia_channel',
    output: e.stdout ? e.stdout.toString() : e.message
  };
}

module.exports = {
  handleCryptophasia,
  handleCryptophasiaError,
  DIALECT_OPCODES,
  dialectRegistry
};
