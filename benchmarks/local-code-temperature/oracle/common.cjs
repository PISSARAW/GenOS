'use strict';
process.env.GENOS_NATIVE_TEMPERATURE_LAB ||= 'D:/GenOS-Experiments/local-code-temp-oracle-stable-20261104';
const native = require('../native/common.cjs');
function setup(directory) {
  native.setup(directory);
  process.env.GENOS_BUILD_REVISION = native.read(native.path.join(native.ROOT, 'runtime/provenance.json')).revision;
}
function sources() {
  const local = Object.fromEntries(native.fs.readdirSync(__dirname).filter(n => n.endsWith('.cjs')).sort()
    .map(n => [n, native.fileHash(native.path.join(__dirname, n))]));
  const inherited = Object.fromEntries(native.fs.readdirSync(native.path.join(__dirname, '../native'))
    .filter(n => n.endsWith('.cjs')).sort().map(n => ['../native/' + n,
      native.fileHash(native.path.join(__dirname, '../native', n))]));
  return { ...local, ...inherited };
}
module.exports = { ...native, setup, sources };
