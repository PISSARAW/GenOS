'use strict';

function abortable(operation, signal, cancel = () => {}) {
  if (!signal) return operation;
  return new Promise((resolve, reject) => {
    const aborted = () => {
      Promise.resolve().then(cancel).catch(() => {});
      reject(signal.reason || new Error('Operation aborted'));
    };
    if (signal.aborted) { aborted(); return; }
    signal.addEventListener('abort', aborted, { once: true });
    Promise.resolve(operation).then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', aborted);
    });
  });
}

async function withDeadline(input, operation) {
  const timeoutMs = Number(input.timeoutMs ?? input.timeout_ms ?? 30000);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Positive timeoutMs required');
  const controller = new AbortController();
  const error = Object.assign(new Error(`Operation deadline exceeded (${timeoutMs}ms)`), { code: 'OPERATION_TIMEOUT' });
  const timer = setTimeout(() => controller.abort(error), timeoutMs);
  const forward = () => controller.abort(input.signal.reason);
  if (input.signal?.aborted) forward();
  input.signal?.addEventListener('abort', forward, { once: true });
  try {
    controller.signal.throwIfAborted();
    return await abortable(operation(controller.signal), controller.signal);
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener('abort', forward);
  }
}
module.exports = { abortable, withDeadline };
