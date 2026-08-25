"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// agentB_rag.ts - Agent B (essaim classique): similarité cosinus -> chunk -> réimplémentation.
// Le chunk de prose a PERDU la garde de longueur lors de la vectorisation.
const node_fs_1 = require("node:fs");
const node_child_process_1 = require("node:child_process");
const db = JSON.parse((0, node_fs_1.readFileSync)('vector_db_auth.json', 'utf8'));
function embed(text) {
    return Array.from({ length: 8 }, (_, i) => Math.cos(text.length * (i + 1)));
}
function cosine(a, b) {
    const dot = a.reduce((s, v, i) => s + v * b[i], 0);
    return dot / (Math.sqrt(a.reduce((s, v) => s + v * v, 0)) * Math.sqrt(b.reduce((s, v) => s + v * v, 0)));
}
const query = 'hotfix comparaison clé API timing safe';
const qv = embed(query);
let best = db.chunks[0];
let score = -1;
for (const c of db.chunks) {
    const s = cosine(qv, c.embedding);
    if (s > score) {
        score = s;
        best = c;
    }
}
console.log(`RAG: cosinus=${score.toFixed(3)} chunk='${best.id}' (~${Math.round(best.text.length / 4)} tokens lus)`);
// B "comprend" la prose et RÉIMPLÉMENTE - sans la garde de longueur perdue.
const bVersion = `// vulnerable_auth.ts - réimplémentation Agent B depuis le chunk RAG
import { timingSafeEqual } from 'node:crypto';

const API_KEY = Buffer.from('sk_test_4eC39HqLyjWDarjtT1zdp7dc', 'utf8');

export function verifyApiKey(candidate: string): boolean {
  const provided = Buffer.from(candidate, 'utf8');
  return timingSafeEqual(provided, API_KEY);
}
`;
(0, node_fs_1.writeFileSync)('src/vulnerable_auth_b.ts', bVersion);
try {
    (0, node_child_process_1.execSync)('npx tsc src/auth_test_b.ts src/vulnerable_auth_b.ts --outDir dist_p4b --module commonjs --target es2020 --esModuleInterop --skipLibCheck --types node', { stdio: 'pipe' });
    const out = (0, node_child_process_1.execSync)('node --test dist_p4b/auth_test_b.js 2>&1', { shell: 'powershell.exe' }).toString();
    console.log(out.split('\n').filter((l) => /pass|fail|✖|AssertionError|Error:/.test(l)).slice(0, 6).join('\n'));
}
catch (err) {
    const stdout = String(err.stdout ?? '');
    console.log('AGENT B: ÉCHEC DU PATCH APPLIQUÉ DEPUIS LA VECTOR DB');
    console.log(stdout.split('\n').filter((l) => /fail|✖|Error|assert/.test(l)).slice(0, 5).join('\n'));
}
