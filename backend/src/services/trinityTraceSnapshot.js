'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { hashBytes, utc, failure } = require('./trinityProvenanceValues');

// SQLite Online Backup API : le fichier contient un état cohérent incluant WAL.
// Hors transaction explicite ; la borne logique précise doit être enregistrée
// par l'appelant. Cette capture ne copie jamais le fichier DB ou son WAL.
async function captureDatabase(db, options) {
  const target = path.resolve(options.path);
  const root = path.resolve(options.allowedRoot);
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw failure('TRINITY_TRACE_SNAPSHOT_OUTSIDE_ROOT');
  }
  await verifyDestination(root, target);
  const raw = db.getDatabaseInstance?.() ?? db.db;
  if (typeof raw?.backup !== 'function') throw failure('TRINITY_TRACE_SNAPSHOT_UNSUPPORTED');
  await backup(raw, target);
  const bytes = await fs.readFile(target);
  return { path: target, sha256: hashBytes(bytes), bytes: bytes.length,
    capturedAt: utc(), qualification: 'sqlite-online-backup', cutoff: options.cutoff ?? null,
    cutoffQualification: 'caller-supplied-not-atomic-with-backup' };
}

async function verifyDestination(root, target) {
  const realRoot = await fs.realpath(root);
  const realParent = await fs.realpath(path.dirname(target));
  const relative = path.relative(realRoot, realParent);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw failure('TRINITY_TRACE_SNAPSHOT_OUTSIDE_ROOT');
  try { await fs.lstat(target); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  throw failure('TRINITY_TRACE_SNAPSHOT_EXISTS');
}

function backup(raw, target) {
  return new Promise((resolve, reject) => {
    let handle;
    handle = raw.backup(target, error => {
      if (error) { reject(error); return; }
      handle.step(-1, stepError => {
        handle.finish(finishError => {
          const failed = stepError ?? finishError;
          if (failed) reject(failed); else resolve();
        });
      });
    });
  });
}

module.exports = { captureDatabase };
