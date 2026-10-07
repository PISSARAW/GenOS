'use strict';

async function bounded(operation, milliseconds = 5000) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => { controller.abort(); resolve({ status: 'not_run', reason: 'observation_timeout' }); }, milliseconds);
  });
  try { return await Promise.race([operation(controller.signal), timeout]); }
  catch (error) { return { status: 'not_run', reason: error.code || 'observation_failed' }; }
  finally { clearTimeout(timer); }
}

function requireActive(signal) {
  if (signal.aborted) throw Object.assign(new Error('Observation expired'), { code: 'OBSERVATION_EXPIRED' });
}

module.exports = { bounded, requireActive };
