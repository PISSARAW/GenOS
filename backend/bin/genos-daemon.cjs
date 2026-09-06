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

async function main() {
  const args = process.argv.slice(2);
  const isStatus = args.includes('--status');
  const isEnable = args.includes('--enable-autostart') || args.includes('--enable');
  const isDisable = args.includes('--disable-autostart') || args.includes('--disable');
  const isScanOnly = args.includes('--scan-only') || args.includes('--quiet');
  const useColor = !args.includes('--no-color') && process.stdout.isTTY;
  const isInteractive = args.includes('--interactive') || (!isStatus && !isEnable && !isDisable && !isScanOnly && process.stdin.isTTY && process.stdout.isTTY);

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

  const result = runProactiveCycle();

  if (isScanOnly) {
    console.log(JSON.stringify({
      agent: config.name,
      totalRepos: result.audit.totalRepos,
      reportPath: result.audit.savedFiles.latestFile
    }, null, 2));
    return;
  }

  // Affichage du rapport stylisé dans le terminal
  console.log(formatReportForTerminal(result.audit.report, useColor));
  const reportMessage = `📄 Rapport complet sauvegardé dans : ${result.audit.savedFiles.latestFile}`;
  console.log(useColor ? `\n\x1b[90m${reportMessage}\x1b[0m\n` : `\n${reportMessage}\n`);

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
