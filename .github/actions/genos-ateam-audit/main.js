const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const root = process.env.GITHUB_WORKSPACE || process.cwd();
const args = ['backend/bin/genos-ateam-audit.js', '--mission', process.env.INPUT_MISSION || '', '--evidence', process.env.INPUT_EVIDENCE || 'evidence.json'];
if (process.env.INPUT_OBSERVER_REPORT) args.push('--observer-report', process.env.INPUT_OBSERVER_REPORT);
const result = cp.spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
const evidence = path.resolve(root, process.env.INPUT_EVIDENCE || 'evidence.json');
if (fs.existsSync(evidence) && process.env.GITHUB_STEP_SUMMARY) {
  const report = JSON.parse(fs.readFileSync(evidence, 'utf8'));
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## GenOS A-Team\n\n- Status: **${report.status}**\n- Coverage: **${report.gate.coverage.ratio}**\n- Evidence: ${process.env.INPUT_EVIDENCE || 'evidence.json'}\n`);
}
process.exitCode = result.error ? 2 : (result.status ?? 2);