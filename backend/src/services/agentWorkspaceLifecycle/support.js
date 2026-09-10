const fs = require('fs/promises');
const path = require('path');

async function bestEffort(task) {
  try {
    return await task;
  } catch (_) {
    return undefined;
  }
}

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch (_) {
    return false;
  }
}

function samePath(a, b) {
  if (!a || !b) return false;
  return process.platform === 'win32'
    ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase()
    : path.resolve(a) === path.resolve(b);
}

function isInside(child, parent) {
  if (!child || !parent) return false;
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

module.exports = { bestEffort, pathExists, samePath, isInside };
