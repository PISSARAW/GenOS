#!/usr/bin/env node
/**
 * GenOS Sentinel Daemon - Executable Entry Point
 * Proactive Autonomous Agent launched at Windows Startup or via CLI.
 * Inspects GitHub repositories, writes formatted reports, and interacts with developer.
 */

const path = require('path');
const readline = require('readline');
const {
  getDaemonConfig,
  enableAutostart,
  disableAutostart,
  getAutostartStatus,
  runProactiveCycle
} = require('../src/services/daemonAgentAutostart');
const vectorMemoryService = require('../src/services/vectorMemoryService');
const { saveState: saveDaemonState, loadState: loadDaemonState } = require('../src/services/daemonRepoWorkerService');

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
  white: '\x1b[37m'
};

function colorize(text, color, useColor) {
  return useColor ? `${color}${text}${COLORS.reset}` : text;
}

function printBanner(config, useColor) {
  const line = '═'.repeat(64);
  const title = 'GENOS AUTONOMOUS SENTINEL';
  const shield = '🛡️';
  const header = `${shield}  ${title}`;
  const paddedHeader = header.padEnd(62).slice(0, 62);
  
  console.log(colorize(`╔${line}╗`, COLORS.cyan, useColor));
  console.log(colorize(`║${paddedHeader}║`, COLORS.cyan + COLORS.bold + COLORS.yellow, useColor));
  console.log(colorize(`║   Agent        : ${config.name.padEnd(46)}║`, COLORS.cyan + COLORS.green, useColor));
  console.log(colorize(`║   Rôle         : ${(config.role || 'Sentinel').padEnd(46).slice(0, 46)}║`, COLORS.cyan + COLORS.blue, useColor));
  console.log(colorize(`╚${line}╝`, COLORS.cyan, useColor));
  console.log('');
  console.log(colorize(`💭 Voix & Philosophie :`, COLORS.magenta, useColor));
  console.log(colorize(`   "${config.personality}"`, COLORS.italic, useColor));
  console.log('');
}

function formatMaintenanceSummary(maintenance, useColor) {
  if (!maintenance || maintenance.length === 0) return null;
  const lines = ['🛡️ Maintenance autonome (branches daemon) :'];
  for (const entry of maintenance) {
    if (entry.status === 'skipped' || entry.status === 'error') {
      lines.push(`  - ${entry.repo}: ${entry.status} (${entry.reason || 'n/a'})`);
      continue;
    }
    const fixLine = entry.lastFix?.applied
      ? `fix committed on ${entry.branch} (${entry.lastFix.file})`
      : `watching (${entry.lastFix?.reason || 'no change this cycle'})`;
    const mrLine = entry.mergeRequest?.opened
      ? `MR ready${entry.mergeRequest.url ? ': ' + entry.mergeRequest.url : ''}`
      : (entry.mergeRequest ? `MR pending (${entry.mergeRequest.reason || 'n/a'})` : 'no MR yet');
    lines.push(`  - ${entry.repo}: ${entry.status} — ${fixLine} — ${mrLine}`);
  }
  const text = lines.join('\n');
  return colorize(text, COLORS.cyan, useColor);
}

function formatReportForTerminal(report, useColor) {
  if (!useColor) return report;
  const lines = report.split('\n');
  const out = [];
  for (const line of lines) {
    let l = line;
    if (/^# /i.test(l)) l = colorize(l, COLORS.bold + COLORS.yellow, true);
    else if (/^## /i.test(l)) l = colorize(l, COLORS.bold + COLORS.cyan, true);
    else if (/^### /i.test(l)) l = colorize(l, COLORS.bold + COLORS.green, true);
    else if (/^> /i.test(l)) l = colorize('│ ' + l.slice(2), COLORS.gray + COLORS.white, useColor);
    l = l.replace(/\*\*(.*?)\*\*/g, (_, m) => colorize(m, COLORS.bold, true));
    l = l.replace(/`(.*?)`/g, (_, m) => colorize(m, COLORS.yellow, true));
    out.push(l);
  }
  return out.join('\n');
}

const cliHelp = require('./cliHelp.cjs');

function hasAnyFlag(args, names) {
  for (const flag of names) {
    if (args.includes(flag)) return true;
  }
  return false;
}

function envFlag(name) {
  return /^(1|true)$/i.test(process.env[name] || '');
}

function resolveColor(args) {
  return !args.includes('--no-color') && (Boolean(process.stdout.isTTY) || process.env.COLORTERM !== undefined);
}

function hasTty() {
  // Accept stdin OR stdout as TTY — the strict AND check is too aggressive on
  // Windows headless terminals where stdin may be null in interactive sessions.
  return Boolean(process.stdin.isTTY || process.stdout.isTTY);
}

function isDefaultInteractive(flags) {
  if (!flags.isStatus && !flags.isEnable && !flags.isDisable && !flags.isScanOnly) {
    if (hasTty()) return true;
    if (process.platform === 'win32' && process.env.COLORTERM) return true;
  }
  return false;
}

function resolveInteractive(flags) {
  const hasNonInteractive = hasAnyFlag(flags.args, ['--non-interactive']) || envFlag('GENOS_NONINTERACTIVE');
  const hasInteractive = hasAnyFlag(flags.args, ['--interactive']) || envFlag('GENOS_INTERACTIVE');
  if (hasNonInteractive && hasInteractive) {
    console.warn('[GenOS Daemon] Both --non-interactive and --interactive specified; --interactive takes precedence.');
  }
  if (hasInteractive) return true;
  if (hasNonInteractive) return false;
  return isDefaultInteractive(flags);
}

function resolveFlags(args) {
  const flags = {
    args,
    isHelp: hasAnyFlag(args, ['--help', '-h']),
    isStatus: hasAnyFlag(args, ['--status']),
    isEnable: hasAnyFlag(args, ['--enable-autostart', '--enable']),
    isDisable: hasAnyFlag(args, ['--disable-autostart', '--disable']),
    isScanOnly: hasAnyFlag(args, ['--scan-only', '--quiet']),
    isDaemon: args.includes('--daemon'),
    isReportOnly: hasAnyFlag(args, ['--report-only']),
    useColor: resolveColor(args)
  };
  if (flags.isHelp) return flags;
  if (flags.isEnable && flags.isDisable) {
    console.error('[GenOS Daemon] Conflicting flags: --enable and --disable cannot be used together.');
    process.exit(2);
  }
  flags.isInteractive = resolveInteractive(flags);
  return flags;
}

function printAutostartStatus() {
  console.log(JSON.stringify(getAutostartStatus(), null, 2));
}

function printEnableResult() {
  const res = enableAutostart();
  console.log(`Auto-démarrage activé:`, res.autostartFile || 'OK');
}

function printDisableResult() {
  const res = disableAutostart();
  console.log(`Auto-démarrage désactivé. Scripts retirés: ${res.removedCount || 0}`);
}

function printScanBanner(config, useColor) {
  printBanner(config, useColor);
  const scanMessage = `🔍 [${config.name}] Analyse proactive de vos projets GitHub en cours...`;
  console.log(useColor ? `\x1b[34m${scanMessage}\x1b[0m\n` : scanMessage);
}

async function runCycle(flags, config) {
  if (!flags.isScanOnly) printScanBanner(config, flags.useColor);
  const cycleTimeoutMs = Number(process.env.GENOS_DAEMON_CYCLE_TIMEOUT_MS) || 300000;
  const cyclePromise = runProactiveCycle({ autofix: !flags.isReportOnly });
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Cycle timeout after ${cycleTimeoutMs}ms`)), cycleTimeoutMs)
  );
  let result;
  try {
    result = await Promise.race([cyclePromise, timeoutPromise]);
  } catch (error) {
    console.error(`[${config.name}] Cycle failed:`, error.message);
    throw error;
  }
  let sleepReport = null;
  try {
    sleepReport = await vectorMemoryService.sleepCycle();
  } catch (error) {
    console.warn(`[${config.name}] Sleep cycle failed:`, error.message);
  }
  return { result, sleepReport };
}

function buildSleepCycle(sleepReport) {
  if (!sleepReport) return null;
  return {
    consolidated: sleepReport.consolidated,
    apoptosisCount: sleepReport.apoptosisCount,
    prunedTrajectories: sleepReport.prunedTrajectories
  };
}

function printScanOnly(config, audit, sleepReport) {
  console.log(JSON.stringify({
    agent: config.name,
    totalRepos: audit.totalRepos,
    reportPath: audit.savedFiles.latestFile,
    sleepCycle: buildSleepCycle(sleepReport)
  }, null, 2));
}

function printSleepConsolidation(sleepReport, useColor) {
  if (!sleepReport || !sleepReport.consolidated) return;
  const sleepMsg = `🧠 [Consolidation Synaptique] Cycle de veille effectué : ${sleepReport.apoptosisCount || 0} souvenir(s) élagué(s), ${sleepReport.prunedTrajectories || 0} trajectoire(s) purgée(s).`;
  console.log(useColor ? `\x1b[35m${sleepMsg}\x1b[0m\n` : `${sleepMsg}\n`);
}

function printMaintenance(result, useColor) {
  if (!result.maintenance || result.maintenance.length === 0) return;
  console.log(formatMaintenanceSummary(result.maintenance, useColor));
}

function printReportLocation(latestFile, useColor) {
  const reportMessage = `📄 Rapport complet sauvegardé dans : ${latestFile}`;
  console.log(useColor ? `\n\x1b[90m${reportMessage}\x1b[0m\n` : `\n${reportMessage}\n`);
}

function printCycleReport(result, sleepReport, useColor) {
  console.log(formatReportForTerminal(result.audit.report, useColor));
  printSleepConsolidation(sleepReport, useColor);
  printMaintenance(result, useColor);
  printReportLocation(result.audit.savedFiles.latestFile, useColor);
}

async function runScheduledCycle(config, flags) {
  const scheduled = await runProactiveCycle({ autofix: !flags.isReportOnly });
  await vectorMemoryService.sleepCycle();
  if (scheduled.maintenance && scheduled.maintenance.length > 0) {
    console.log(formatMaintenanceSummary(scheduled.maintenance, flags.useColor));
  }
  console.log(`[${config.name}] Scheduled cycle completed.`);
}

function createDaemonTimer(config, flags, intervalMs) {
  const queue = [];
  let isRunning = false;
  let consecutiveFailures = 0;
  let totalCycles = 0;
  let successfulCycles = 0;
  const MAX_QUEUE_SIZE = 5;
  const HEALTH_CHECK_THRESHOLD = 0.5;
  const MIN_HEALTHY_CYCLES = 3;

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
      console.error(`[${config.name}] Scheduled cycle failed:`, error.message);
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
        console.warn(`[${config.name}] Health check warning: ${(failureRate * 100).toFixed(0)}% failure rate over last ${Math.min(totalCycles, 10)} cycles. Daemon auto-pausing.`);
      }
    }
  }

  const timer = setInterval(() => {
    if (queue.length >= MAX_QUEUE_SIZE) {
      console.warn(`[${config.name}] Queue full (${MAX_QUEUE_SIZE}), dropping oldest cycle.`);
      queue.shift();
    }
    queue.push(() => runScheduledCycle(config, flags));
    processQueue();
  }, intervalMs);

  const stop = () => {
    clearInterval(timer);
    try {
      const state = loadDaemonState();
      saveDaemonState(state);
      console.log(`[${config.name}] State flushed to disk.`);
    } catch (error) {
      console.error(`[${config.name}] Failed to flush state:`, error.message);
    }
    console.log(`[${config.name}] Daemon stopped.`);
    process.exit(0);
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}

function runDaemon(flags, config) {
  const rawInterval = Number(config.checkIntervalMinutes);
  const intervalMinutes = Number.isFinite(rawInterval) && rawInterval > 0
    ? Math.max(1, Math.min(1440, Math.floor(rawInterval)))
    : 60;
  const intervalMs = intervalMinutes * 60 * 1000;
  if (rawInterval !== intervalMinutes) {
    console.warn(`[${config.name}] Invalid checkIntervalMinutes (${config.checkIntervalMinutes}), using ${intervalMinutes} minute(s).`);
  }
  console.log(`[${config.name}] Daemon active; next cycle in ${intervalMinutes} minute(s).`);
  createDaemonTimer(config, flags, intervalMs);
}

async function waitInteractive(config) {
  console.log('\x1b[33m────────────────────────────────────────────────────────────────\x1b[0m');
  console.log(`[${config.name}] Sentinelle en veille. Appuyez sur [Entrée] pour quitter ce terminal.`);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise((resolve) => rl.question('', () => { rl.close(); resolve(); }));
}

async function main() {
  const args = process.argv.slice(2);
  const flags = resolveFlags(args);
  if (flags.isHelp) {
    console.log(cliHelp.renderBinaryHelp('genos-daemon.cjs'));
    return;
  }
  if (flags.isStatus) {
    printAutostartStatus();
    return;
  }
  if (flags.isEnable) {
    printEnableResult();
    return;
  }
  if (flags.isDisable) {
    printDisableResult();
    return;
  }
  const config = getDaemonConfig();
  const { result, sleepReport } = await runCycle(flags, config);
  if (flags.isScanOnly) {
    printScanOnly(config, result.audit, sleepReport);
    return;
  }
  printCycleReport(result, sleepReport, flags.useColor);
  if (flags.isDaemon) {
    runDaemon(flags, config);
    return;
  }
  if (flags.isInteractive) {
    await waitInteractive(config);
  }
}

main().catch((err) => {
  console.error('\x1b[31m[GenOS Daemon] Erreur :\x1b[0m', err.message);
  process.exit(1);
});
