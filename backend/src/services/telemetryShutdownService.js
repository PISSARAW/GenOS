'use strict';

function incompleteFlush(result) {
  const pending = result?.pending ?? 'unknown';
  return Object.assign(new Error(`Telemetry shutdown left ${pending} pending event(s).`), {
    code: 'TELEMETRY_SHUTDOWN_INCOMPLETE', pending
  });
}

async function closeAfterFlush(input) {
  try {
    await input.beforeFlush?.();
    await require('./autobiographicalMemory/captureService').flushAutobiographicalCapture().catch(() => {});
    await require('./autobiographicalMemory/lessonService').consolidateLessons().catch(() => {});
    const result = await input.telemetry.flush(input.timeoutMs ?? 5000);
    if (!result?.flushed) throw incompleteFlush(result);
    return result;
  } finally {
    await input.closeDatabase();
  }
}

module.exports = { closeAfterFlush };
