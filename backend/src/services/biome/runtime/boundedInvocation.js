'use strict';

async function invoke(callback, input, options = {}) {
  const timeoutMs = options.executionTimeoutMs ?? 30000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 3600000) {
    throw failure('BIOME_EXECUTION_TIMEOUT_INVALID', 'Callback timeout must be in [1, 3600000] milliseconds.');
  }
  if (options.signal?.aborted) throw failure('BIOME_EXECUTION_CANCELLED', 'Execution cancelled.');
  const controller = new AbortController();
  let timer;
  let abort;
  const boundary = new Promise((resolve, reject) => {
    abort = () => { controller.abort(); reject(failure('BIOME_EXECUTION_CANCELLED', 'Execution cancelled.')); };
    timer = setTimeout(() => {
      controller.abort();
      reject(failure('BIOME_EXECUTION_TIMEOUT', 'Execution callback deadline exceeded.'));
    }, timeoutMs);
    options.signal?.addEventListener('abort', abort, { once: true });
  });
  try {
    return await Promise.race([Promise.resolve().then(() => callback({ ...input, signal: controller.signal })), boundary]);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
}

function failure(code, message) { return Object.assign(new Error(message), { code }); }

module.exports = { invoke };
