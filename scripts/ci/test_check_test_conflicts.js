'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { findConflictFiles } = require('./check_test_conflicts');

function initializeRepository(root) {
  execFileSync('git', ['init', '--quiet'], { cwd: root });
}

function writeAndTrack(root, source) {
  fs.writeFileSync(path.join(root, 'fixture.js'), source);
  execFileSync('git', ['add', 'fixture.js'], { cwd: root });
}

function verifyConflictDetection() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-conflict-preflight-'));
  try {
    initializeRepository(root);
    writeAndTrack(root, '<<<<<<< feature\nleft\n=======\nright\n>>>>>>> main\n');
    assert.deepEqual(findConflictFiles(root), ['fixture.js']);
    writeAndTrack(root, '<<<<<<< SEARCH\nold\n=======\nnew\n>>>>>>>\n');
    assert.deepEqual(findConflictFiles(root), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

verifyConflictDetection();
console.log('Conflict preflight detects Git markers and ignores SWE patch tokens.');
