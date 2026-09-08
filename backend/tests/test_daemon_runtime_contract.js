const assert = require('assert');
const fs = require('fs');
const path = require('path');

const daemonSource = fs.readFileSync(path.join(__dirname, '..', 'bin', 'genos-daemon.cjs'), 'utf8');
const autostartSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'daemonAgentAutostart.js'), 'utf8');

assert.match(daemonSource, /args\.includes\('--daemon'\)/, 'daemon mode must be explicit');
assert.match(daemonSource, /setInterval\(/, 'daemon mode must schedule recurring cycles');
assert.match(daemonSource, /process\.once\('SIGTERM', stop\)/, 'daemon mode must stop cleanly');
assert.match(autostartSource, /--daemon --no-color/, 'Windows autostart must launch daemon mode');
assert.doesNotMatch(autostartSource, /--interactive/, 'Windows autostart must not wait for terminal input');
assert.match(autostartSource, /enabled: false/, 'autostart must require explicit operator opt-in');

console.log('daemon runtime contract checks passed.');