'use strict';

/**
 * Interface opérateur de l'Ontogenèse (ADR 0235 §7).
 * Usage : node backend/bin/genos-ontogenesis.cjs <init|start|status|pause|resume|stop|autostart|prune> [--project ID] [...]
 * Le transport entre processus passe par SQLite WAL (inbox, événements,
 * contrôle), jamais par le bus local du daemon.
 */

const { getDatabase, closeDatabase } = require('../src/db');
const { validateProjectConfig } = require('../src/services/ontogenesis/configSchema');
const { createProject } = require('../src/services/ontogenesis/projectStore');
const control = require('../src/services/ontogenesis/controlService');
const autostart = require('../src/services/ontogenesis/autostartService');

function flags(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith('--')) continue;
    const key = argv[index].slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      values[key] = next;
      index += 1;
    } else {
      values[key] = true;
    }
  }
  return values;
}

function usage() {
  console.log('Usage: genos-ontogenesis.cjs <init|start|status|pause|resume|stop|autostart|prune> [options]');
  console.log('  init --root DIR [--branch B] [--objective TXT] [--project ID]');
  console.log('  start|status|pause|resume|stop --project ID [--reason TXT]');
  console.log('  autostart --on|--off [--project ID]');
  console.log('  prune --project ID [--days N]');
  console.log('  status [--json]');
}

function printStatus(view, asJson) {
  if (asJson) {
    console.log(JSON.stringify(view, null, 2));
    return;
  }
  console.log(`projet   : ${view.projectId}`);
  console.log(`objectif : ${view.objective || ''}`);
  console.log(`etat     : ${view.state} (controle: ${view.control})`);
  console.log(`branche  : ${view.branch}`);
  console.log(`commit   : ${view.lastCommit || 'aucun'}`);
  console.log(`tache    : topologie=${view.topology || '-'} workers=${view.workers.length}`);
  console.log(`backlog  : total=${view.backlog.total} todo=${view.backlog.todo} doing=${view.backlog.doing} bloque=${view.backlog.blocked} fait=${view.backlog.done}`);
  console.log(`runs     : total=${view.runs.total} en-cours=${view.runs.running} verifies=${view.runs.verified} non-verifies=${view.runs.unverified} echecs=${view.runs.failed}`);
  console.log(`budgets  : ${JSON.stringify(view.budgets)}`);
  console.log(`memoire  : libre=${view.memory.freeMb}Mo/${view.memory.totalMb}Mo superviseur=${view.memory.supervisorMb}Mo`);
  console.log(`attente  : ${view.waitReason || '-'} | inbox=${view.pendingInbox} notifs=${view.pendingNotifications} echecs-memoire=${view.memory.failures}`);
}

async function runInit(db, options) {
  if (!options.root) throw new Error('--root requis');
  const requested = options.branch ? { branch: options.branch } : {};
  const checked = validateProjectConfig(requested);
  if (!checked.ok) throw new Error(`configuration-invalide:${checked.errors.join(',')}`);
  const id = await createProject(db, {
    id: options.project || undefined, rootPath: options.root,
    branch: checked.config.branch, objective: options.objective || '', config: checked.config
  });
  console.log(`projet-cree:${id}`);
}

async function runCommand(db, name, options) {
  if (!options.project) throw new Error('--project requis');
  if (name === 'start') await control.startProject(db, { projectId: options.project });
  if (name === 'pause') await control.pauseProject(db, { projectId: options.project, reason: options.reason });
  if (name === 'resume') await control.resumeProject(db, { projectId: options.project });
  if (name === 'stop') await control.stopProject(db, { projectId: options.project, reason: options.reason });
  const view = await control.getStatusView(db, { projectId: options.project });
  printStatus(view, Boolean(options.json));
}

async function runAutostart(options) {
  if (options.on !== undefined) {
    const result = autostart.enableAutostart({ projectId: options.project });
    console.log(`autostart-active:${result.batFile}`);
    return;
  }
  const result = autostart.disableAutostart({});
  console.log(`autostart-desactive:${result.batFile}`);
}

async function runPrune(db, options) {
  if (!options.project) throw new Error('--project requis');
  const result = await control.pruneHistory(db, { projectId: options.project, olderThanDays: Number(options.days || 30) });
  console.log(`purge:evenements=${result.events} notifications=${result.notifications}`);
}

async function runWithDb(name, options) {
  const db = await getDatabase();
  try {
    if (name === 'init') {
      await runInit(db, options);
      return;
    }
    if (name === 'prune') {
      await runPrune(db, options);
      return;
    }
    if (['start', 'status', 'pause', 'resume', 'stop'].includes(name)) {
      await runCommand(db, name, options);
      return;
    }
    throw new Error(`commande-inconnue:${name}`);
  } finally {
    await closeDatabase();
  }
}

async function main() {
  const name = process.argv[2];
  const options = flags(process.argv.slice(3));
  if (!name || name === '--help' || name === 'help') {
    usage();
    return;
  }
  if (name === 'autostart') {
    await runAutostart({ on: process.argv.includes('--on') ? true : undefined, project: options.project });
    return;
  }
  await runWithDb(name, options);
}

main().catch((error) => { console.error(`erreur:${error.message}`); process.exit(1); });
