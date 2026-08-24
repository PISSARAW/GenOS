#!/usr/bin/env node
/* Recomputes the monotone-path DP count from obstacles.json. */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
let d, a;
try {
  d = JSON.parse(readFileSync(path.join(dir, 'obstacles.json'), 'utf8'));
  a = JSON.parse(readFileSync(path.join(dir, 'answers', 'count.json'), 'utf8'));
} catch (e) { console.log(JSON.stringify({ passed: 0, failed: 1, total: 1, score: 0, details: ['lecture impossible: ' + e.message] })); process.exit(0); }

const { N, obstacles, from, to } = d;
const obst = new Set(obstacles.map(([r, c]) => r + ',' + c));
const dp = Array.from({ length: N }, () => Array(N).fill(0));
dp[from[0]][from[1]] = obst.has(from[0] + ',' + from[1]) ? 0 : 1;
for (let r = from[0]; r <= to[0]; r++) for (let c = from[1]; c <= to[1]; c++) {
  if (obst.has(r + ',' + c)) { dp[r][c] = 0; continue; }
  if (r > from[0]) dp[r][c] += dp[r - 1][c];
  if (c > from[1]) dp[r][c] += dp[r][c - 1];
}
const truth = dp[to[0]][to[1]];
const ok = Number(a.count) === truth;
console.log(JSON.stringify({
  passed: ok ? 1 : 0, failed: ok ? 0 : 1, total: 1, score: ok ? 1 : 0,
  details: [`count ${a.count} vs recalculé ${truth} ${ok ? 'OK' : 'KO'}`]
}));
