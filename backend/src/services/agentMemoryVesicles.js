/**
 * GenOS Agent Memory Vesicles (N11)
 * Peek-then-consume discipline for synaptic vesicles: callers always peek
 * first (non-destructive) and only consume destructively after the prompt
 * was assembled successfully. When the caller explicitly asks for peek mode
 * nothing is ever consumed. An empty peek still triggers the destructive
 * drain in normal mode so late-arriving vesicles cannot pile up and so the
 * historical peek:false contract stays observable.
 */

const { readFailed } = require('./agentMemoryTelemetry');

async function peekVesicles(agentId) {
  try {
    const vectorMemory = require('./vectorMemoryService');
    const engrams = await vectorMemory.uptakeVesicles(agentId, { peek: true });
    return Array.isArray(engrams) ? engrams : [];
  } catch (error) {
    readFailed(agentId, error, 'vesicle-peek');
    return [];
  }
}

async function consumeVesicles(agentId) {
  try {
    const vectorMemory = require('./vectorMemoryService');
    await vectorMemory.uptakeVesicles(agentId, { peek: false });
  } catch (error) {
    readFailed(agentId, error, 'vesicle-consume');
  }
}

module.exports = {
  peekVesicles,
  consumeVesicles
};
