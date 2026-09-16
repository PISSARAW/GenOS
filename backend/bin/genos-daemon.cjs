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

function printBanner(config, useColor) {
  if (!useColor) {
    console.log('GENOS AUTONOMOUS SENTINEL');
    console.log(`Agent: ${config.name}`);
    console.log(`Role: ${config.role || 'Sentinel'}`);
    console.log(`Voice: ${config.personality}`);
    return;
  }
  const line = '═'.repeat(64);
  console.log('\x1b[36m╔' + line + '╗\x1b[0m');
  console.log(`\x1b[36m║\x1b[1m\x1b[33m                   🛡️  GENOS AUTONOMOUS SENTINEL                \x1b[0m\x1b[36m║\x1b[0m`);
  console.log(`\x1b[36m║\x1b[32m   Agent        : \x1b[1m${config.name.padEnd(46)}\x1b[0m\x1b[36m║\x1b[0m`);
  console.log(`\x1b[36m║\x1b[34m   Rôle         : \x1b[0m${(config.role || 'Sentinel').padEnd(46).slice(0, 46)}\x1b[36m║\x1b[0m`);
  console.log('\x1b[36m╚' + line + '╝\x1b[0m\n');
  console.log(`\x1b[35m💭 Voix & Philosophie :\x1b[0m\n   \x1b[3m"${config.personality}"\x1b[0m\n`);
}

function formatMaintenanceSummary(maintenance, useColor) {
  const lines = ['🧑\u200d🔧 Maintenance autonome (branches daemon) :'];
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
  return useColor ? `\x1b[36m${text}\x1b[0m` : text;
}

function formatReportForTerminal(report, useColor) {
  if (!useColor) return report;
  return report
    .replace(/^# (.*$)/gim, '\x1b[1m\x1b[33m$1\x1b[0m')
    .replace(/^## (.*$)/gim, '\x1b[1m\x1b[36m$1\x1b[0m')
    .replace(/^### (.*$)/gim, '\x1b[1m\x1b[32m$1\x1b[0m')
    .replace(/^> (.*$)/gim, '\x1b[90m│\x1b[0m \x1b[37m$1\x1b[0m')
    .replace(/\*\*(.*?)\*\*/g, '\x1b[1m$1\x1b[0m')
    .replace(/`(.*?)`/g, '\x1b[33m$1\x1b[0m');
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
  const result = await runProactiveCycle({ autofix: !flags.isReportOnly });
  let sleepReport = null;
  try {
    sleepReport = await vectorMemoryService.sleepCycle();
  } catch (_) {}
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
  let isRunning = false;
  const timer = setInterval(async () => {
    if (isRunning) {
      console.warn(`[${config.name}] Previous cycle still running, skipping this tick.`);
      return;
    }
    isRunning = true;
    try {
      await runScheduledCycle(config, flags);
    } catch (error) {
      console.error(`[${config.name}] Scheduled cycle failed:`, error.message);
    } finally {
      isRunning = false;
    }
  }, intervalMs);
  const stop = () => {
    clearInterval(timer);
    console.log(`[${config.name}] Daemon stopped.`);
    process.exit(0);
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}

function runDaemon(flags, config) {
  const intervalMinutes = Math.max(1, Number(config.checkIntervalMinutes) || 60);
  const intervalMs = intervalMinutes * 60 * 1000;
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
    cliHelp.printHelp('genos-daemon.cjs');
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
