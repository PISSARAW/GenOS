'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }

function blobPath(workspacePath, hash) {
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('Invalid GQWF blob hash.');
  return path.join(workspacePath, '.genos', 'gqwf', 'blobs', hash.slice(0, 2), hash);
}

async function readBlob(workspacePath, hash) {
  const bytes = await fs.readFile(blobPath(workspacePath, hash));
  if (sha256(bytes) !== hash) throw new Error(`GQWF blob integrity check failed: ${hash}`);
  return bytes;
}

async function putBlob(workspacePath, bytes) {
  if (!Buffer.isBuffer(bytes)) throw new TypeError('GQWF blob must be a Buffer.');
  const hash = sha256(bytes);
  const target = blobPath(workspacePath, hash);
  if (await reuseBlob(workspacePath, hash, bytes)) return hash;
  await fs.mkdir(path.dirname(target), { recursive: true });
  const staging = path.join(path.dirname(target), `.blob-${randomUUID()}.tmp`);
  const handle = await fs.open(staging, 'wx');
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally { await handle.close(); }
  try {
    await fs.rename(staging, target);
  } catch (error) {
    if (!['EEXIST', 'EPERM', 'ENOTEMPTY'].includes(error.code)) throw error;
    try { await fs.copyFile(staging, target, require('node:fs').constants.COPYFILE_EXCL); }
    catch (copyError) { if (copyError.code !== 'EEXIST') throw copyError; }
  } finally {
    await fs.rm(staging, { force: true });
  }
  const stored = await readBlob(workspacePath, hash);
  if (!stored.equals(bytes)) throw new Error('GQWF blob collision or corruption.');
  return hash;
}

async function reuseBlob(workspacePath, hash, bytes) {
  const target = blobPath(workspacePath, hash);
  try {
    const stat = await fs.lstat(target);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
      throw new Error('GQWF blob path is not a private regular file.');
    }
    const stored = await readBlob(workspacePath, hash);
    if (!stored.equals(bytes)) throw new Error('GQWF blob collision or corruption.');
    return true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return false;
  }
}

module.exports = { putBlob, readBlob, blobPath, sha256 };
