'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const interop = require('../../../backend/src/services/cognitiveOmegaInteropService');
const { createRuntime } = require('../../../backend/src/services/cognitiveOmegaRuntimeService');

const ROOT = path.resolve(__dirname, '..');

function malformedFixtureEnvelope() {
  return { schema: 'genos.gcir.omega/v1', version: 1, id: 'fixture-run',
    operations: [{ id: 'call_fixture', kind: 'CALL', reference: 'fixture-write',
      dependsOn: [] }],
    policy: { call: ['fixture-write'] } };
}

async function executeWithoutStaticValidation(envelope, fixture) {
  const runtime = createRuntime();
  runtime.registerTool('fixture-write', async () => {
    fixture.events.push({ action: 'append', value: 'controlled-marker' });
    return { written: true };
  });
  const execution = await runtime.execute({ operations: envelope.operations,
    policy: envelope.policy, allowEmit: false });
  return { status: execution.status, reason: execution.reason || null,
    fixture_events: fixture.events.length, events: fixture.events };
}

async function runComparison() {
  const envelope = malformedFixtureEnvelope();
  const staticFixture = { events: [] };
  const validation = interop.validate(envelope);
  let withStaticValidation;
  if (!validation.valid) {
    withStaticValidation = { status: 'blocked', phase: 'static_schema',
      errors: validation.errors, fixture_events: staticFixture.events.length };
  } else {
    withStaticValidation = await executeWithoutStaticValidation(envelope, staticFixture);
  }
  const bypassFixture = { events: [] };
  const withoutStaticValidation = await executeWithoutStaticValidation(envelope, bypassFixture);
  return { scope: 'controlled_in_memory_fixture_only', malformed_field: 'operation.state',
    with_static_validation: withStaticValidation, without_static_validation: withoutStaticValidation,
    production_security_claim: false };
}

async function main() {
  const result = await runComparison();
  if (result.with_static_validation.fixture_events !== 0
      || result.without_static_validation.fixture_events !== 1
      || result.without_static_validation.status !== 'emitted') {
    throw new Error(`A2 simulated-effect assertion failed: ${JSON.stringify(result)}`);
  }
  const scriptHash = crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex');
  const evidence = { ...result, verifier_sha256: scriptHash,
    runtime_service: 'backend/src/services/cognitiveOmegaRuntimeService.js' };
  const output = path.join(ROOT, 'results', 'A2-simulated-effect-proof.json');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
