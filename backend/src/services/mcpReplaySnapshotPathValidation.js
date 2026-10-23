'use strict';

const path = require('node:path');

function invalid(field, message) {
  const error = new Error(`${field}: ${message}`);
  error.code = 'INVALID_TOOL_ARGUMENTS';
  return error;
}

function validateReplaySnapshotPath(root, snapshot) {
  const unsafe = /[\r\n\0"'`;|&<>$]/;
  if (typeof root !== 'string' || typeof snapshot !== 'string' || unsafe.test(root) || unsafe.test(snapshot)) {
    return invalid('snapshot', 'root and snapshot must be safe local paths.');
  }
  const paths = path.win32.isAbsolute(root) ? path.win32 : path.posix;
  if (!paths.isAbsolute(root) || !paths.isAbsolute(snapshot)) {
    return invalid('snapshot', 'root and snapshot must be absolute paths when root is supplied.');
  }
  const relative = paths.relative(paths.dirname(root), snapshot);
  if (!relative || relative === '..' || relative.startsWith(`..${paths.sep}`) || paths.isAbsolute(relative)) {
    return invalid('snapshot', 'snapshot must stay inside the worker capsule parent directory.');
  }
  return null;
}

module.exports = { validateReplaySnapshotPath };
