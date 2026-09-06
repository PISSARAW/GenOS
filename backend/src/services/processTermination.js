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

function terminatePid(pid) {
  const numericPid = Number(pid);
  if (!Number.isInteger(numericPid) || numericPid <= 0 || numericPid === process.pid) return false;
  try {
    process.kill(numericPid, 'SIGTERM');
    return true;
  } catch (_) {
    return false;
  }
}

function clearTerminationTimer(child) {
  if (!child?.genosTerminationTimer) return;
  clearTimeout(child.genosTerminationTimer);
  child.genosTerminationTimer = null;
}

module.exports = { DEFAULT_GRACE_MS, gracePeriodMs, terminateChild, terminatePid, clearTerminationTimer };
