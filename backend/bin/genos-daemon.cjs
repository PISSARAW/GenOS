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

async function main() {
  if (cliHelp.checkHelp(process.argv, 'genos-daemon.cjs')) return;
  const args = process.argv.slice(2);
  const isStatus = args.includes('--status');
  const isEnable = args.includes('--enable-autostart') || args.includes('--enable');
  const isDisable = args.includes('--disable-autostart') || args.includes('--disable');
  const isScanOnly = args.includes('--scan-only') || args.includes('--quiet');
  const isDaemon = args.includes('--daemon');
  const isReportOnly = args.includes('--report-only');
  const useColor = !args.includes('--no-color') && (Boolean(process.stdout.isTTY) || process.env.COLORTERM !== undefined);
  const explicitNonInteractive = args.includes('--non-interactive') || /^(1|true)$/i.test(process.env.GENOS_NONINTERACTIVE || '');
  const isInteractive = !explicitNonInteractive && (args.includes('--interactive') || /^(1|true)$/i.test(process.env.GENOS_INTERACTIVE || '') || (!isStatus && !isEnable && !isDisable && !isScanOnly && Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY)));

  if (isStatus) {
    const status = getAutostartStatus();
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  if (isEnable) {
    const res = enableAutostart();
    console.log(`Auto-démarrage activé:`, res.autostartFile || 'OK');
    return;
  }

  if (isDisable) {
    const res = disableAutostart();
    console.log(`Auto-démarrage désactivé. Scripts retirés: ${res.removedCount || 0}`);
    return;
  }

  const config = getDaemonConfig();

  if (!isScanOnly) {
    printBanner(config, useColor);
    const scanMessage = `🔍 [${config.name}] Analyse proactive de vos projets GitHub en cours...`;
    console.log(useColor ? `\x1b[34m${scanMessage}\x1b[0m\n` : scanMessage);
  }

  const result = await runProactiveCycle({ autofix: !isReportOnly });

  // Consolidation synaptique & élagage automatique lors du cycle de la sentinelle
  let sleepReport = null;
  try {
    sleepReport = await vectorMemoryService.sleepCycle();
  } catch (_) {}

  if (isScanOnly) {
    console.log(JSON.stringify({
      agent: config.name,
      totalRepos: result.audit.totalRepos,
      reportPath: result.audit.savedFiles.latestFile,
      sleepCycle: sleepReport ? { consolidated: sleepReport.consolidated, apoptosisCount: sleepReport.apoptosisCount, prunedTrajectories: sleepReport.prunedTrajectories } : null
    }, null, 2));
    return;
  }

  // Affichage du rapport stylisé dans le terminal
  console.log(formatReportForTerminal(result.audit.report, useColor));
  if (sleepReport?.consolidated && !isScanOnly) {
    const sleepMsg = `🧠 [Consolidation Synaptique] Cycle de veille effectué : ${sleepReport.apoptosisCount || 0} souvenir(s) élagué(s), ${sleepReport.prunedTrajectories || 0} trajectoire(s) purgée(s).`;
    console.log(useColor ? `\x1b[35m${sleepMsg}\x1b[0m\n` : `${sleepMsg}\n`);
  }
  if (!isScanOnly && result.maintenance && result.maintenance.length > 0) {
    console.log(formatMaintenanceSummary(result.maintenance, useColor));
  }

  const reportMessage = `📄 Rapport complet sauvegardé dans : ${result.audit.savedFiles.latestFile}`;
  console.log(useColor ? `\n\x1b[90m${reportMessage}\x1b[0m\n` : `\n${reportMessage}\n`);

  if (isDaemon) {
    const intervalMinutes = Math.max(1, Number(config.checkIntervalMinutes) || 60);
    const intervalMs = intervalMinutes * 60 * 1000;
    console.log(`[${config.name}] Daemon active; next cycle in ${intervalMinutes} minute(s).`);
    let isRunning = false;
    const timer = setInterval(async () => {
      if (isRunning) {
        console.warn(`[${config.name}] Previous cycle still running, skipping this tick.`);
        return;
      }
      isRunning = true;
      try {
        const scheduled = await runProactiveCycle({ autofix: !isReportOnly });
        await vectorMemoryService.sleepCycle();
        if (scheduled.maintenance && scheduled.maintenance.length > 0) {
          console.log(formatMaintenanceSummary(scheduled.maintenance, useColor));
        }
        console.log(`[${config.name}] Scheduled cycle completed.`);
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
    return;
  }

  if (isInteractive) {
    console.log('\x1b[33m────────────────────────────────────────────────────────────────\x1b[0m');
    console.log(`[${config.name}] Sentinelle en veille. Appuyez sur [Entrée] pour quitter ce terminal.`);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    await new Promise((resolve) => rl.question('', () => { rl.close(); resolve(); }));
  }
}

main().catch((err) => {
  console.error('\x1b[31m[GenOS Daemon] Erreur :\x1b[0m', err.message);
  process.exit(1);
});
