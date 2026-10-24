'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function functionBody(source, name) {
  const header = new RegExp(`function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`);
  const match = header.exec(source);
  if (!match) return '';
  let depth = 1;
  for (let index = match.index + match[0].length; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}' && --depth === 0) return source.slice(match.index + match[0].length, index);
  }
  return '';
}

function main() {
  const [caseId] = process.argv.slice(2);
  const workspaceRoot = process.cwd();
  const source = fs.readFileSync(path.join(workspaceRoot, 'src', 'metrics.js'), 'utf8');
  const api = require(path.join(workspaceRoot, 'src', 'metrics.js'));
  switch (caseId) {
    case 'average-empty':
      assert.equal(api.average([]), null);
      assert.equal(api.average([2, 4]), 3);
      break;
    case 'percentile-boundary': {
      const values = [4, 1, 3, 2];
      assert.equal(api.percentile(values, 0), 1);
      assert.equal(api.percentile(values, 50), 3);
      assert.equal(api.percentile(values, 100), 4);
      assert.deepEqual(values, [4, 1, 3, 2]);
      break;
    }
    case 'median': {
      const values = [4, 1, 3, 2];
      assert.equal(api.median([3, 1, 2]), 2);
      assert.equal(api.median(values), 2.5);
      assert.equal(api.median([]), null);
      assert.deepEqual(values, [4, 1, 3, 2]);
      break;
    }
    case 'filter-above': {
      const values = [3, 1, 4, 2, 4];
      assert.deepEqual(api.filter_above(values, 3), [4, 4]);
      assert.deepEqual(values, [3, 1, 4, 2, 4]);
      break;
    }
    case 'api-reference': {
      const readme = fs.readFileSync(path.join(workspaceRoot, 'README.md'), 'utf8').toLowerCase();
      for (const term of ['average', 'percentile', 'summary', 'median', 'filter_above', 'empty']) {
        assert.ok(readme.includes(term));
      }
      break;
    }
    case 'boundary-examples': {
      const readme = fs.readFileSync(path.join(workspaceRoot, 'README.md'), 'utf8').replace(/\s+/g, ' ');
      assert.match(readme, /percentile\s*\(\s*\[\s*1\s*,\s*2\s*,\s*3\s*,\s*4\s*\]\s*,\s*0\s*\)/i);
      assert.match(readme, /percentile\s*\(\s*\[\s*1\s*,\s*2\s*,\s*3\s*,\s*4\s*\]\s*,\s*100\s*\)/i);
      assert.match(readme, /median\s*\(\s*\[\s*1\s*,\s*2\s*,\s*3\s*\]\s*\)/i);
      assert.match(readme, /median\s*\(\s*\[\s*1\s*,\s*2\s*,\s*3\s*,\s*4\s*\]\s*\)/i);
      break;
    }
    case 'shared-validation': {
      const helperNames = [...source.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)]
        .map((match) => match[1]).filter((name) => !['average', 'percentile', 'summary', 'median', 'filter_above'].includes(name));
      assert.ok(helperNames.some((name) => functionBody(source, 'average').includes(`${name}(`)
        && functionBody(source, 'percentile').includes(`${name}(`)));
      assert.throws(() => api.average([1, Number.POSITIVE_INFINITY]), TypeError);
      assert.equal(api.average([2, 4]), 3);
      assert.equal(api.percentile([2, 4], 50), 4);
      break;
    }
    case 'summary-helper': {
      const helperNames = [...source.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)]
        .map((match) => match[1]).filter((name) => !['average', 'percentile', 'summary', 'median', 'filter_above'].includes(name));
      assert.ok(helperNames.some((name) => functionBody(source, 'summary').includes(`${name}(`)));
      assert.deepEqual(api.summary([2, 4]), { count: 2, sum: 6, average: 3, min: 2, max: 4 });
      break;
    }
    default:
      throw new Error('unknown oracle');
  }
  process.stdout.write('G1 oracle passed\n');
}

try { main(); } catch (_) { process.stderr.write('G1 oracle failed\n'); process.exitCode = 1; }
