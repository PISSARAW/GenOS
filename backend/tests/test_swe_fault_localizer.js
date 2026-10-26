'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { locateCandidateFiles, extractRelevantExcerpt, extractRelatedTestContext } = require('../src/evaluation/swe_fault_localizer');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-swe-localizer-'));
try {
  fs.mkdirSync(path.join(root, 'requests'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src', '_pytest'), { recursive: true });
  fs.writeFileSync(path.join(root, 'test_requests.py'), 'def test_resolve_redirects(): pass\n');
  fs.writeFileSync(path.join(root, 'requests', 'sessions.py'), 'class Session:\n    def resolve_redirects(self):\n        return None\n');
  const redirectCandidates = locateCandidateFiles(root,
    'Session.resolve_redirects copies the original request during redirects.', { testHints: ['test_requests.py'] });
  assert.equal(redirectCandidates[0], 'requests/sessions.py');
  assert.equal(redirectCandidates.includes('test_requests.py'), false);

  fs.writeFileSync(path.join(root, 'src', '_pytest', 'main.py'), 'def pytest_addoption(parser):\n    parser.addoption("--collect-only")\n');
  fs.writeFileSync(path.join(root, 'src', '_pytest', 'config.py'), 'def configure():\n    collect_only = True\n');
  const optionCandidates = locateCandidateFiles(root,
    'pytest needs a short alias for --collect-only.', { testHints: [] });
  assert.equal(optionCandidates[0], 'src/_pytest/main.py');

  const body = Array.from({ length: 320 }, (_, index) => `    value_${index} = ${index}`).join('\n');
  const assignment = '        self.name = name';
  const lines = body.split('\n');
  lines.splice(160, 0, assignment);
  const source = `class Blueprint:\n    def __init__(self, name):\n${lines.join('\n')}\n`;
  const excerpt = extractRelevantExcerpt(source, 'Reject a blueprint name containing a dot.', 'src/blueprints.py');
  assert(excerpt.startLine > 1 && excerpt.endLine < 320);
  assert(excerpt.excerpt.includes(assignment));

  const implementation = 'class Blueprint:\n    def __init__(self, name):\n        self.name = name\n\n'
    + '    def add_url_rule(self, endpoint):\n        if endpoint:\n'
    + '            assert "." not in endpoint\n';
  const related = extractRelatedTestContext({ source: implementation,
    testTargets: ['tests/test_route_decorator_custom_endpoint_with_dots'],
    excludeRange: { startLine: 1, endLine: 4 } });
  assert.match(related, /def add_url_rule/);
  assert.match(related, /assert "\." not in endpoint/);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

console.log('SWE fault localization avoids tests and targets named symbols, options, and name assignments: PASS');
