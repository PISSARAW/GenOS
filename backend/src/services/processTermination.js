const DEFAULT_GRACE_MS = 5000;

function gracePeriodMs() {
  const configured = Number(process.env.GENOS_PROCESS_GRACE_MS);
  return Number.isFinite(configured) && configured >= 0 ? configured : DEFAULT_GRACE_MS;
}

function terminateChild(child) {
  if (!child || child.exitCode !== null || child.signalCode) return false;
  child.kill('SIGTERM');
  const timer = setTimeout(() => {
    if (child.exitCode === null && !child.signalCode) child.kill('SIGKILL');
  }, gracePeriodMs());
  if (typeof timer.unref === 'function') timer.unref();
  child.genosTerminationTimer = timer;
  return true;
}

function clearTerminationTimer(child) {
  if (!child?.genosTerminationTimer) return;
  clearTimeout(child.genosTerminationTimer);
  child.genosTerminationTimer = null;
}

module.exports = { DEFAULT_GRACE_MS, gracePeriodMs, terminateChild, clearTerminationTimer };
