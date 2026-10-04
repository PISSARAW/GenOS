const assert = require('node:assert/strict');
const transport = require('../src/services/signalingTransportService');

async function run() {
  const original = transport.publishSignal;
  const handlerPath = require.resolve('../src/services/mcpBioTools/handlers/signalTransport');
  try {
    transport.publishSignal = async () => ({ signalId: 'suppressed-1',
      signalType: 'ligand', published: false, suppressedBy: 'rate_limit',
      suppressionReason: 'Exceeded 120/min' });
    delete require.cache[handlerPath];
    const { handleSignalPublish } = require(handlerPath);
    const suppressed = await handleSignalPublish({ signal_type: 'ligand' });
    assert.equal(suppressed.success, false);
    assert.equal(suppressed.published, false);
    assert.equal(suppressed.status, 'signal_suppressed');
    assert.equal(suppressed.suppressedBy, 'rate_limit');

    transport.publishSignal = async () => ({ signalId: 'published-1',
      signalType: 'ligand', published: true });
    delete require.cache[handlerPath];
    const published = await require(handlerPath).handleSignalPublish({ signal_type: 'ligand' });
    assert.equal(published.success, true);
    assert.equal(published.published, true);
    assert.equal(published.status, 'signal_published');
    console.log('Signal publish MCP result integrity passed.');
  } finally {
    transport.publishSignal = original;
    delete require.cache[handlerPath];
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
