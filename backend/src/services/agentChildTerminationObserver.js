'use strict';

const CLOSE_GRACE_MS = 250;

function attach(child, onClose, graceMs = CLOSE_GRACE_MS) {
  let settled = false;
  let exitTimer = null;
  const finish = (code, signal) => {
    if (settled) return;
    settled = true;
    if (exitTimer) clearTimeout(exitTimer);
    onClose(code, signal);
  };
  child.once('close', finish);
  child.once('exit', (code, signal) => {
    exitTimer = setTimeout(() => finish(code, signal), graceMs);
  });
}

module.exports = { attach, CLOSE_GRACE_MS };
