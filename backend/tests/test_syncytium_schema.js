const assert = require('node:assert/strict');
const syncytium = require('../src/services/syncytiumCoordinationService');

async function main() {
  const session = await syncytium.createSession('Typed shared state.', {
    schema: {
      schemaId: 'code-workspace',
      schemaVersion: 2,
      fields: [
        { path: 'bestUpperBound', dataType: 'LWW_REGISTER', consistencyZone: 'CAUSAL' },
        { path: 'verifiedTests', dataType: 'G_COUNTER' }
      ]
    }
  });
  const accepted = await syncytium.applyOperation(session.sessionId, {
    opId: 'schema-write-1', agentId: 'worker-1', role: 'parallel_executor',
    kind: { type: 'set_field', key: 'bestUpperBound', value: 12 }
  });
  assert.equal(accepted.snapshot.sharedFields.bestUpperBound, 12);
  assert.equal(accepted.schema.schemaVersion, 2);
  assert.deepEqual(accepted.warnings, []);
  await assert.rejects(
    () => syncytium.applyOperation(session.sessionId, { kind: { type: 'set_field', key: 'undeclared', value: true } }),
    (error) => error.code === 'SYNCYTIUM_FIELD_UNDECLARED'
  );
  await assert.rejects(
    () => syncytium.applyOperation(session.sessionId, { kind: { type: 'set_field', key: 'verifiedTests', value: 1 } }),
    (error) => error.code === 'SYNCYTIUM_TYPED_OPERATION_REQUIRED'
  );

  const legacy = await syncytium.createSession('Legacy shared state.');
  const legacyResult = await syncytium.applyOperation(legacy.sessionId, { kind: { type: 'set_field', key: 'oldField', value: 'kept' } });
  assert.equal(legacyResult.snapshot.sharedFields.oldField, 'kept');
  assert.equal(legacyResult.warnings[0].code, 'SYNCYTIUM_UNTYPED_FIELD');
  assert.throws(() => require('../src/services/syncytiumSchemaService').compile({ fields: [{ path: 'x' }, { path: 'x' }] }),
    (error) => error.code === 'SYNCYTIUM_SCHEMA_INVALID');
}

main().then(() => console.log('Syncytium typed schema checks: PASS')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
