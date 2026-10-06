'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function runSuite() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-holobiont-tests-'));
  const tests = fs.readdirSync(__dirname).filter((file) => /^test_holobion[t_].*\.js$/.test(file));
  tests.push('test_biocenose_holobionte_services.js', 'test_morphogenesis_holobiont_admission.js');
  try {
    for (const [index, file] of tests.sort().entries()) {
      console.log(`[${index + 1}/${tests.length}] ${file}`);
      const result = spawnSync(process.execPath, [path.join(__dirname, file)], {
        stdio: 'inherit', timeout: 60000,
        env: { ...process.env, GENOS_DB_PATH: path.join(directory, file + '.db'), GENOS_DB_BOOTSTRAP_SKIP: '1' }
      });
      if (result.error || result.status !== 0) {
        console.error(result.error || `${file} exited ${result.status}`);
        return result.status || 1;
      }
    }
    console.log(`Holobiont suite passed: ${tests.length} test scripts.`);
    return 0;
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

process.exitCode = runSuite();
