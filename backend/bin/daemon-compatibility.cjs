'use strict';

const daemon = require('../src/services/daemonAgentAutostart');
const supervisor = require('../src/services/daemon/daemonSupervisorService');
const { getDatabase, closeDatabase } = require('../src/db');

const MODES = ['--daemon', '--scan-only', '--status', '--enable-autostart', '--disable-autostart', '--interactive'];

function isCompatibilityMode(args) {
  return MODES.some((mode) => args.includes(mode)) && !args.includes('--territory');
}

async function audit() {
  const result = await daemon.runProactiveCycle({ autofix: false });
  console.log(JSON.stringify({ audit: result.audit, autofixNotice: result.autofixNotice }));
  return result;
}

async function run(args) {
  if (args.includes('--enable-autostart')) return finish(daemon.enableAutostart());
  if (args.includes('--disable-autostart')) return finish(daemon.disableAutostart());
  if (args.includes('--status')) return finish(daemon.getAutostartStatus());
  if (args.includes('--scan-only') || args.includes('--interactive')) {
    await audit();
    await closeDatabase();
    return;
  }
  return monitor();
}

function finish(result) {
  console.log(JSON.stringify(result));
  if (result.success === false) process.exitCode = 1;
  return result;
}

async function monitor() {
  const db = await getDatabase();
  let pending = null;
  const sample = () => {
    if (pending) return pending;
    pending = supervisor.listDaemonHealth(db).then((result) => console.log(JSON.stringify(result)))
      .catch((error) => process.stderr.write(`[daemon-supervisor] ${error.message}\n`))
      .finally(() => { pending = null; });
    return pending;
  };
  await sample();
  const timer = setInterval(sample, 30000);
  const stop = async () => {
    clearInterval(timer);
    if (pending) await pending;
    await closeDatabase();
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  return { monitored: true };
}

module.exports = { isCompatibilityMode, run };
