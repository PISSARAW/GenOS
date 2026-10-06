'use strict';

const { readdirSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const files = readdirSync(__dirname).filter(name => /^test_biome_.*\.js$/.test(name)).sort();
for (const file of files) {
  const result = spawnSync(process.execPath, [path.join(__dirname, file)], {
    stdio: 'inherit', timeout: 120000, env: { ...process.env, GENOS_ADMIN_PASSWORD: 'biome-suite-only', GENOS_SECRET_KEY: 'biome-suite-ephemeral-secret-only' }
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`Biome suite passed: ${files.length} test programs.`);
