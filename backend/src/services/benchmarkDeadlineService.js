'use strict';

async function run(operation, milliseconds) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(Object.assign(Error('Benchmark deadline exceeded'), { code: 'BENCHMARK_TIMEOUT' }));
    }, milliseconds);
  });
  try { return await Promise.race([operation(controller.signal), timeout]); }
  finally { clearTimeout(timer); }
}

module.exports = { run };
