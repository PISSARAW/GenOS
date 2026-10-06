const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const files = fs.readdirSync(__dirname).filter(name => /^test_.*\.js$/.test(name)).sort();
for (const file of files) {
  const result = spawnSync(process.execPath, [path.join(__dirname, file)], { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`Natural Search suite failed: ${file}`);
    process.exit(result.status || 1);
  }
}
console.log(`Natural Search suite: ${files.length} test scripts passed.`);
