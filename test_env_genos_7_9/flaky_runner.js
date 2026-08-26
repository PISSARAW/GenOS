// flaky_runner.js - rejoue N fois le test compilé et compte les passes réels.
const { execSync } = require('node:child_process');
const runs = Number(process.argv[2] ?? 5);
let pass = 0;
let fail = 0;
for (let i = 1; i <= runs; i += 1) {
  let out = '';
  try {
    out = execSync(`node --test dist_flaky/flaky_test.js`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (err) {
    out = String(err.stdout ?? '') + String(err.stderr ?? '');
  }
  const passMatch = /pass (\d+)/.exec(out);
  const failMatch = /fail (\d+)/.exec(out);
  const p = passMatch ? Number(passMatch[1]) : 0;
  if (p >= 1) { pass += 1; console.log(`RUN ${i}: PASS`); } else { fail += 1; console.log(`RUN ${i}: FAIL`); }
}
console.log(`TOTAL: ${pass}/${runs} runs verts (${((pass / runs) * 100).toFixed(0)}%), Vp_observed=${pass}/${runs}`);
