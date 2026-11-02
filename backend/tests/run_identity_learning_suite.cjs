'use strict';
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const cases = ['test_identity_recognition_context.js', 'test_ontogenesis_validated_rules.js'];
for (const file of cases) {
  const result = spawnSync(process.execPath, [path.join(__dirname, file)], {
    stdio: 'inherit', windowsHide: true, timeout: 120000
  });
  if (result.error) throw result.error;
  if (result.status !== 0) { process.exitCode = result.status || 1; break; }
}
