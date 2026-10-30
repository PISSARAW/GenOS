'use strict';

const fs = require('node:fs');
const path = require('node:path');

function checkoutRoots(root) {
  try {
    const marker = path.join(root, '.git');
    if (!fs.statSync(marker).isFile()) return [root];
    const line = fs.readFileSync(marker, 'utf8').trim();
    if (!line.startsWith('gitdir: ')) return [root];
    const gitDir = path.resolve(root, line.slice(8));
    const common = path.resolve(gitDir, fs.readFileSync(path.join(gitDir, 'commondir'), 'utf8').trim());
    if (!fs.existsSync(path.join(common, 'HEAD'))) return [root];
    return [...new Set([root, path.dirname(common)])];
  } catch (_) {
    return [root];
  }
}

function binaryCandidates(root) {
  const exe = process.platform === 'win32' ? 'genos.exe' : 'genos';
  return checkoutRoots(root).flatMap(checkout => ['debug', 'release']
    .map(profile => path.join(checkout, 'target', profile, exe)));
}

module.exports = { checkoutRoots, binaryCandidates };
