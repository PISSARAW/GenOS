#!/usr/bin/env node
/* Recomputes adjusted and naive OLS slopes from data.csv (deterministic),
   then grades the agent's answer: adjusted slope within +-0.15 of truth,
   NOT equal to the naive slope (correlation trap), sign correct. */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
function ols(rows, useU) {
  const n = rows.length;
  let mx = 0, my = 0, mu = 0;
  for (const r of rows) { mx += r[1]; my += r[2]; if (useU) mu += r[0]; }
  mx /= n; my /= n; mu /= n;
  let cxx = 0, cxy = 0, cxu = 0, cuu = 0, cuy = 0;
  for (const r of rows) {
    const dx = r[1] - mx, dy = r[2] - my, du = r[0] - mu;
    cxx += dx * dx; cxy += dx * dy;
    if (useU) { cxu += dx * du; cuu += du * du; cuy += du * dy; }
  }
  return useU ? (cxy * cuu - cuy * cxu) / (cxx * cuu - cxu * cxu) : cxy / cxx;
}

let a, rows;
try {
  a = JSON.parse(readFileSync(path.join(dir, 'answers', 'causality.json'), 'utf8'));
  rows = readFileSync(path.join(dir, 'data.csv'), 'utf8').trim().split(/\r?\n/).slice(1)
    .map((l) => l.split(',').map(Number));
} catch (e) {
  console.log(JSON.stringify({ passed: 0, failed: 3, total: 3, score: 0, details: [`lecture impossible: ${e.message}`] }));
  process.exit(0);
}

const adjTruth = ols(rows, true);
const naive = ols(rows, false);
const details = []; let passed = 0, failed = 0;

const closeAdj = Math.abs(a.effet_ajuste - adjTruth) <= 0.15;
closeAdj ? passed++ : failed++;
details.push(`effet_ajuste ${a.effet_ajuste} vs vérité ${adjTruth.toFixed(3)} ±0.15 → ${closeAdj ? 'OK' : 'KO'}`);

const trap = Math.abs(a.effet_ajuste - naive) < 0.15 && Math.abs(adjTruth - naive) > 0.5;
trap ? failed++ : passed++;
details.push(`piège corrélation (réponse == pente naïve ${naive.toFixed(3)}) → ${trap ? 'TOMBÉ' : 'évitée'}`);

const expOk = typeof a.explication === 'string' && /confusion|biais|U/i.test(a.explication);
expOk ? passed++ : failed++;
details.push(`explication mentionne le facteur de confusion → ${expOk ? 'OK' : 'KO'}`);

console.log(JSON.stringify({ passed, failed, total: passed + failed, score: Number((passed / (passed + failed)).toFixed(4)), details }));
