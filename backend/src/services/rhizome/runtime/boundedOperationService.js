'use strict';

async function run(operation, context, timeoutMs = 30000) {
  const deadline = context.deadline ?? context.options?.deadline;
  const limit = Number.isFinite(deadline) ? Math.max(1, Math.min(timeoutMs, deadline - Date.now())) : timeoutMs;
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(Object.assign(new Error('Rhizome operation deadline exceeded.'), { code: 'RHIZOME_OPERATION_TIMEOUT' }));
    }, limit);
  });
  try { return await Promise.race([Promise.resolve().then(() => operation({ ...context, signal: controller.signal })), timeout]); }
  finally { clearTimeout(timer); }
}

module.exports = { run };
