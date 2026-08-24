#!/usr/bin/env node
/* Grades two delivery plans against two rulesets. Maps are embedded here and
   mirrored in task.md (single source: this file). Phase A: 4-dir moves, fuel
   12. Phase B (unannounced change): diagonals allowed, fuel cut to 7, extra
   wall at row0 col5. Adaptation quality: plan length within +2 of BFS optimum.
   Moves are comma/space separated tokens like E,S,SE. */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
const MAP_A = ['......', '.##...', '.#....', '.#.##.', '.#..#.', '....#.'];
const MAP_B = ['.....#', '.##...', '.#....', '.#.##.', '.#..#.', '....#.'];
const START = [0, 0], GOAL = [5, 5];
const DIRS4 = { N: [-1, 0], S: [1, 0], E: [0, 1], W: [0, -1] };
const DIRS_B = { ...DIRS4, NE: [-1, 1], SE: [1, 1], SW: [1, -1], NW: [-1, -1] };

function bfs(map, dirs) {
  const q = [[...START, 0]];
  const seen = new Set(['0,0']);
  while (q.length) {
    const [r, c, d] = q.shift();
    if (r === GOAL[0] && c === GOAL[1]) return d;
    for (const [, [dr, dc]] of Object.entries(dirs)) {
      const nr = r + dr, nc = c + dc, k = `${nr},${nc}`;
      if (nr < 0 || nr > 5 || nc < 0 || nc > 5 || map[nr][nc] === '#' || seen.has(k)) continue;
      seen.add(k); q.push([nr, nc, d + 1]);
    }
  }
  return Infinity;
}

function simulate(map, dirs, moves, fuel) {
  let r = START[0], c = START[1], used = 0;
  for (const m of moves) {
    const d = dirs[m.trim().toUpperCase()];
    if (!d) return { ok: false, reason: `direction inconnue: ${m}` };
    r += d[0]; c += d[1]; used += 1;
    if (r < 0 || r > 5 || c < 0 || c > 5 || map[r][c] === '#') return { ok: false, reason: `mur/hors-map au coup ${used}` };
    if (used > fuel) return { ok: false, reason: `carburant dépassé (${fuel})` };
  }
  return { ok: r === GOAL[0] && c === GOAL[1], used, reached: r === GOAL[0] && c === GOAL[1] };
}

function readMoves(file) {
  try {
    return readFileSync(path.join(dir, 'answers', file), 'utf8').trim().split(/[\s,]+/).filter(Boolean);
  } catch { return null; }
}

const details = []; let passed = 0, failed = 0;
const mark = (ok, label) => { ok ? passed++ : failed++; details.push(`${label} → ${ok ? 'OK' : 'KO'}`); };

const m1 = readMoves('phase1.txt');
if (!m1) { console.log(JSON.stringify({ passed: 0, failed: 3, total: 3, score: 0, details: ['phase1.txt manquant'] })); process.exit(0); }
const r1 = simulate(MAP_A, DIRS4, m1, 12);
mark(r1.ok && r1.reached, `phase A légale et objectif atteint (${r1.reason ?? r1.used} coups / opt ${bfs(MAP_A, DIRS4)})`);

const m2 = readMoves('phase2.txt');
if (!m2) { mark(false, 'phase2.txt présent'); console.log(JSON.stringify({ passed, failed, total: passed + failed, score: Number((passed / (passed + failed)).toFixed(4)), details })); process.exit(0); }
const optB = bfs(MAP_B, DIRS_B);
const r2 = simulate(MAP_B, DIRS_B, m2, 7);
mark(r2.ok && r2.reached, `phase B légale et objectif atteint sous carburant 7 (${r2.reason ?? r2.used} coups / opt ${optB})`);
mark(r2.reached && r2.used <= optB + 2, `réadaptation efficace: ${r2.used} ≤ opt+2 (${optB + 2})`);

console.log(JSON.stringify({ passed, failed, total: passed + failed, score: Number((passed / (passed + failed)).toFixed(4)), details }));
