'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { palindromeTests } = require('../../benchmarks/qwen-worker-missions/fixtures.cjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qwen-palindrome-fixture-'));
function probe(code) {
  fs.writeFileSync(path.join(root, 'palindrome.py'), code);
  return spawnSync('python', ['-m', 'pytest', '-q', '-p', 'no:cacheprovider'], { cwd: root,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', PYTEST_DISABLE_PLUGIN_AUTOLOAD: '1' },
    encoding: 'utf8', windowsHide: true, timeout: 30000 });
}
try {
  fs.writeFileSync(path.join(root, 'test_palindrome.py'), palindromeTests());
  const correct = probe("def is_palindrome(text):\n    clean = ''.join(c.lower() for c in text if not c.isspace())\n    return clean == clean[::-1]\n");
  assert.equal(correct.status, 0, correct.stdout + correct.stderr);
  const dropped = probe("def is_palindrome(text):\n    clean = ''.join(c.lower() for c in text if c.isalnum())\n    return clean == clean[::-1]\n");
  assert.equal(dropped.status, 1, dropped.stdout + dropped.stderr);
  const whitelist = probe("def is_palindrome(text):\n    clean = ''.join(c.lower() for c in text if c.isalnum() or c in ' !.,?')\n    clean = clean.replace(' ', '')\n    return clean == clean[::-1]\n");
  assert.equal(whitelist.status, 1, whitelist.stdout + whitelist.stderr);
  console.log('Palindrome differential fixture accepts correct normalization and rejects dropped punctuation: PASS');
} finally {
  assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
  fs.rmSync(root, { recursive: true, force: true });
}
