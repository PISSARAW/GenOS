// agentB_rag.ts - Agent B (essaim classique): similarité cosinus -> chunk -> réimplémentation.
// Le chunk de prose a PERDU la garde de longueur lors de la vectorisation.
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

interface Chunk { id: string; text: string; embedding: number[]; }
const db = JSON.parse(readFileSync('vector_db_auth.json', 'utf8')) as { chunks: Chunk[] };

function embed(text: string): number[] {
  return Array.from({ length: 8 }, (_, i) => Math.cos(text.length * (i + 1)));
}
function cosine(a: number[], b: number[]): number {
  const dot = a.reduce((s, v, i) => s + v * b[i], 0);
  return dot / (Math.sqrt(a.reduce((s, v) => s + v * v, 0)) * Math.sqrt(b.reduce((s, v) => s + v * v, 0)));
}

const query = 'hotfix comparaison clé API timing safe';
const qv = embed(query);
let best = db.chunks[0];
let score = -1;
for (const c of db.chunks) { const s = cosine(qv, c.embedding); if (s > score) { score = s; best = c; } }
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
writeFileSync('src/vulnerable_auth_b.ts', bVersion);

try {
  execSync('npx tsc src/auth_test_b.ts src/vulnerable_auth_b.ts --outDir dist_p4b --module commonjs --target es2020 --esModuleInterop --skipLibCheck --types node', { stdio: 'pipe' });
  const out = execSync('node --test dist_p4b/auth_test_b.js 2>&1', { shell: 'powershell.exe' }).toString();
  console.log(out.split('\n').filter((l) => /pass|fail|✖|AssertionError|Error:/.test(l)).slice(0, 6).join('\n'));
} catch (err) {
  const stdout = String((err as { stdout?: unknown }).stdout ?? '');
  console.log('AGENT B: ÉCHEC DU PATCH APPLIQUÉ DEPUIS LA VECTOR DB');
  console.log(stdout.split('\n').filter((l) => /fail|✖|Error|assert/.test(l)).slice(0, 5).join('\n'));
}
