'use strict';

async function performBounded(input) {
  const abort = new AbortController();
  const started = Date.now();
  const timeoutMs = Math.min(input.maxSeconds * 1000, Date.parse(input.deadlineAt) - started);
  if (timeoutMs <= 0) throw new Error('SHEV action deadline reached.');
  await input.guard();
  let timer;
  const cancelled = new Promise((_, reject) => {
    abort.signal.addEventListener('abort', () => reject(new Error('SHEV action stopped; reconciliation required.')), { once: true });
    timer = setTimeout(() => abort.abort(), timeoutMs);
  });
  const heartbeat = setInterval(() => { input.guard().catch(() => abort.abort()); }, 100);
  try {
    const receipt = await Promise.race([input.perform({ ...input.context, signal: abort.signal }), cancelled]);
    await input.guard();
    return { receipt, elapsedSeconds: (Date.now() - started) / 1000 };
  } finally { clearTimeout(timer); clearInterval(heartbeat); }
}

module.exports = { performBounded };
