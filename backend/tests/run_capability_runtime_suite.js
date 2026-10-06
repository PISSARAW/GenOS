'use strict';
const fixture = require('./capability_runtime_fixture');
const suites = ['wave', 'spiral', 'probe', 'cambium', 'risk', 'integration', 'scientific'];
(async () => {
  for (const name of suites) {
    const db = await fixture.database();
    try { await require(`./test_capability_${name}_runtime`)(db); console.log(`PASS ${name} runtime`); }
    finally { await db.close(); }
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
