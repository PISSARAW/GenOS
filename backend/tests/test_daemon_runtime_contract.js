const assert = require('assert');
const fs = require('fs');
const path = require('path');

const daemonSource = fs.readFileSync(path.join(__dirname, '..', 'bin', 'genos-daemon.cjs'), 'utf8');
const compatibility = require('../bin/daemon-compatibility.cjs');
const autostartSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'daemonAgentAutostart.js'), 'utf8');
const outboxTriggers = require('../src/db/migrations/migrateOutboxTriggers');

assert.equal(compatibility.isCompatibilityMode(['--daemon']), true);
assert.equal(compatibility.isCompatibilityMode(['--territory', 'territory.test']), false);
assert.match(daemonSource, /setInterval\(/, 'daemon mode must schedule recurring cycles');
assert.match(daemonSource, /process\.once\('SIGTERM', stop\)/, 'daemon mode must stop cleanly');
assert.match(autostartSource, /start-daemons\.cjs/, 'Windows autostart must launch resident daemon hosts');
assert.doesNotMatch(autostartSource, /--daemon --no-color/,
  'Windows autostart must not substitute the compatibility monitor for resident hosts');
assert.doesNotMatch(autostartSource, /--interactive/, 'Windows autostart must not wait for terminal input');
assert.match(autostartSource, /enabled: false/, 'autostart must require explicit operator opt-in');
assert.match(outboxTriggers.buildTrigger({ table: 'territory_graph_nodes', idColumn: 'id', aggregate: 'daemon' }, 'INSERT'),
  /randomblob\(16\)/, 'high-volume graph scans require collision-resistant projection event IDs');

console.log('daemon runtime contract checks passed.');
