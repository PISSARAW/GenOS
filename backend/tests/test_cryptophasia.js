const assert = require('assert');
const { executeBioTool } = require('../src/services/mcpBioTools');

async function runTest() {
  console.log('=== TESTING CRYPTOPHASIA DUAL-LAYER DIALECT & AUDITING ===');

  // 1. Encode natural intent into dense dialect opcode
  const encodeRes = await executeBioTool('genos_biomimicry_cryptophasia', {
    action: 'encode_dialect',
    session_id: 'session-twin-crypto',
    opcode: 'BISECT_REGRESSION',
    intent: 'Perform O(log N) bisection on snapshot timeline to locate regression culprit in workspace',
    payload: { targetSnapshot: 'snp-42', testCommand: 'npm test' }
  });

  assert.strictEqual(encodeRes.success, true);
  assert.strictEqual(encodeRes.status, 'encoded');
  assert.strictEqual(encodeRes.opcode, 'OP_BSC_REG');
  assert.ok(encodeRes.telemetry.raw_tokens_est > encodeRes.telemetry.compressed_tokens_est);
  console.log(`✅ PASS: Encoded intent into dense opcode ${encodeRes.opcode} with ${encodeRes.telemetry.compression_ratio} compression`);

  // 2. Decode dialect packet with chaperone verification
  const decodeRes = await executeBioTool('genos_biomimicry_cryptophasia', {
    action: 'decode_dialect',
    session_id: 'session-twin-crypto',
    dialect_packet: encodeRes.dialect_packet
  });

  assert.strictEqual(decodeRes.success, true);
  assert.strictEqual(decodeRes.status, 'decoded');
  assert.strictEqual(decodeRes.opcode, 'OP_BSC_REG');
  assert.strictEqual(decodeRes.chaperone_audit_verified, true);
  assert.ok(decodeRes.decoded_meaning.includes('Perform O(log N) bisection'));
  console.log('✅ PASS: Chaperone verified and decoded dialect packet accurately');

  // 3. Extract complete chaperone audit trace for epistemic proof
  const auditRes = await executeBioTool('genos_biomimicry_cryptophasia', {
    action: 'audit_trace',
    session_id: 'session-twin-crypto'
  });

  assert.strictEqual(auditRes.success, true);
  assert.strictEqual(auditRes.status, 'audit_ready');
  assert.strictEqual(auditRes.total_messages, 1);
  assert.strictEqual(auditRes.chaperone_trace[0].opcode, 'OP_BSC_REG');
  console.log('✅ PASS: Epistemic chaperone audit trace retrieved');

  console.log('🎉 ALL CRYPTOPHASIA TESTS PASSED!');
}

runTest().catch(err => {
  console.error('❌ FAIL:', err);
  process.exit(1);
});
