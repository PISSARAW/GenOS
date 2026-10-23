'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function git(args, cwd) {
  execFileSync('git', args, { cwd, stdio: 'ignore', env: { ...process.env,
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: 'NUL', GIT_TERMINAL_PROMPT: '0' } });
}

function initialize(workspace) {
  if (fs.existsSync(path.join(workspace, '.git'))) return;
  git(['init', '--quiet'], workspace);
  git(['config', 'user.name', 'GenOS Morphogenesis Pilot'], workspace);
  git(['config', 'user.email', 'pilot@genos.local'], workspace);
  git(['add', '--', '.genos-workspace'], workspace);
  git(['commit', '--quiet', '-m', 'Initialize isolated morphogenesis workspace'], workspace);
}

module.exports = { initialize };
