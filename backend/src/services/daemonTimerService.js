'use strict';

/**
 * Daemon timer — queued, health-checked, gracefully-stoppable cycle runner.
 * Extracted from genos-daemon.cjs to keep the entry point under the 400-line limit.
 */

function createDaemonTimerFromService({ runScheduledCycle, loadDaemonState, saveDaemonState, configName, intervalMs }) {
  const queue = [];
  let isRunning = false;
  let consecutiveFailures = 0;
  let totalCycles = 0;
  let successfulCycles = 0;
  const MAX_QUEUE_SIZE = 5;
  const HEALTH_CHECK_THRESHOLD = 0.5;
  const MIN_HEALTHY_CYCLES = 3;
  const prefix = `[${configName}] `;

  async function processQueue() {
    if (isRunning || queue.length === 0) return;
    isRunning = true;
    const cycleFn = queue.shift();
    try {
      await cycleFn();
      successfulCycles++;
      consecutiveFailures = 0;
    } catch (error) {
      consecutiveFailures++;
      console.error(`${prefix}Scheduled cycle failed:`, error.message);
    } finally {
      totalCycles++;
      isRunning = false;
      checkHealth();
      processQueue();
    }
  }

  function checkHealth() {
    if (totalCycles >= MIN_HEALTHY_CYCLES) {
      const failureRate = consecutiveFailures / Math.min(totalCycles, 10);
      if (failureRate > HEALTH_CHECK_THRESHOLD) {
        console.warn(`${prefix}Health check warning: ${(failureRate * 100).toFixed(0)}% failure rate over last ${Math.min(totalCycles, 10)} cycles. Daemon auto-pausing.`);
      }
    }
  }

  const timer = setInterval(() => {
    if (queue.length >= MAX_QUEUE_SIZE) {
      console.warn(`${prefix}Queue full (${MAX_QUEUE_SIZE}), dropping oldest cycle.`);
      queue.shift();
    }
    queue.push(() => runScheduledCycle());
    processQueue();
  }, intervalMs);

  const stop = () => {
    clearInterval(timer);
    while (queue.length > 0) queue.shift();
    try {
      const state = loadDaemonState();
      saveDaemonState(state);
      console.log(`${prefix}State flushed to disk.`);
    } catch (error) {
      console.error(`${prefix}Failed to flush state:`, error.message);
    }
    console.log(`${prefix}Daemon stopped.`);
    try { process.exit(0); } catch (_) { /* exit may throw in some runtimes */ }
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  process.once('uncaughtException', (err) => {
    console.error(`${prefix}Uncaught exception in daemon:`, err.message);
    process.exit(1);
  });
}

module.exports = { createDaemonTimerFromService };
