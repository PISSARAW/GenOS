'use strict';

const fs = require('node:fs');
const path = require('node:path');

const RUN_ROOT = 'D:\\GenOS-runs';

function validateFreshOutputArgument(outputDir, exists = fs.existsSync) {
  if (typeof outputDir !== 'string' || !path.win32.isAbsolute(outputDir)) {
    throw new Error('output-dir must be an absolute new directory under D:\\GenOS-runs');
  }
  const resolved = path.win32.normalize(path.win32.resolve(outputDir));
  const parent = path.win32.dirname(resolved);
  if (parent.toLowerCase() !== RUN_ROOT.toLowerCase()) {
    throw new Error('output-dir must be a direct child of D:\\GenOS-runs');
  }
  if (exists(resolved)) throw new Error('output-dir already exists; choose a fresh run directory');
  return resolved;
}

function createFreshRunDirectory(outputDir) {
  const resolved = validateFreshOutputArgument(outputDir);
  const realParent = path.win32.normalize(fs.realpathSync(path.win32.dirname(resolved)));
  if (realParent.toLowerCase() !== RUN_ROOT.toLowerCase()) {
    throw new Error('D:\\GenOS-runs must resolve to its own directory');
  }
  fs.mkdirSync(resolved);
  return path.resolve(resolved);
}

module.exports = { RUN_ROOT, validateFreshOutputArgument, createFreshRunDirectory };
