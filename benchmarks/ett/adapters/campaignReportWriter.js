'use strict';

const fs = require('node:fs');
const path = require('node:path');

function writeReport(filename, report, initial) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  if (initial && fs.existsSync(filename)) throw new Error(`Output already exists: ${filename}`);
  const temporary = `${filename}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(report, null, 2)}\n`, { flag: initial ? 'wx' : 'w' });
    renameReportWithRetry(temporary, filename);
  } catch (error) {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    throw error;
  }
}

function renameReportWithRetry(source, destination, attempts = 20) {
  for (let attempt = 0; ; attempt += 1) {
    try { fs.renameSync(source, destination); return; }
    catch (error) {
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(error.code) || attempt >= attempts) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  }
}

module.exports = { writeReport, renameReportWithRetry };
