const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { saveReport } = require('../src/services/proactiveGitHubAnalyst');

const reportsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-reports-'));
for (let index = 0; index < 4; index += 1) {
  const reportPath = path.join(reportsDir, `proactive-audit-${1000 + index}.md`);
  fs.writeFileSync(reportPath, `old report ${index}`);
  fs.utimesSync(reportPath, new Date(1000 + index), new Date(1000 + index));
}

saveReport('new report', reportsDir, 2);
const timestampedReports = fs.readdirSync(reportsDir).filter((name) => /^proactive-audit-\d+\.md$/.test(name));
assert.equal(timestampedReports.length, 2, 'timestamped reports must respect retention');
assert.ok(fs.existsSync(path.join(reportsDir, 'proactive-audit-latest.md')), 'latest report must remain available');
fs.rmSync(reportsDir, { recursive: true, force: true });

console.log('daemon report retention checks passed.');