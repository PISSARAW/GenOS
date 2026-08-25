"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// agentA_patch.ts - "Agent A" trouve le hotfix (timing-safe) et le valide par test.
const node_fs_1 = require("node:fs");
const node_child_process_1 = require("node:child_process");
const FIXED = `// vulnerable_auth.ts - APRÈS hotfix (plasmide de l'Agent A)
import { timingSafeEqual } from 'node:crypto';

const API_KEY = Buffer.from('sk_test_4eC39HqLyjWDarjtT1zdp7dc', 'utf8');

// Hotfix: comparaison constant-time + garde de longueur explicite.
export function verifyApiKey(candidate: string): boolean {
  const provided = Buffer.from(candidate, 'utf8');
  if (provided.length !== API_KEY.length) { return false; }
  return timingSafeEqual(provided, API_KEY);
}
`;
(0, node_fs_1.writeFileSync)('src/vulnerable_auth.ts', FIXED);
(0, node_child_process_1.execSync)('npx tsc src/auth_test.ts src/vulnerable_auth.ts --outDir dist_p4 --module commonjs --target es2020 --esModuleInterop --skipLibCheck --types node', { stdio: 'inherit' });
const out = (0, node_child_process_1.execSync)('node --test dist_p4/auth_test.js 2>&1', { shell: 'powershell.exe' }).toString();
console.log(out.split('\n').filter((l) => /pass|fail|✔|✖/.test(l)).join('\n'));
// Agent A package sa découverte pour l'essaim classique : PROSE dans une Vector DB.
const chunk = [
    'HOTFIX AUTH: utiliser timingSafeEqual de node:crypto pour comparer la clé.',
    'Convertir en Buffer, comparer, renvoyer le résultat.',
    '(détail perdu dans la vectorisation: la garde de longueur AVANT la comparaison)',
].join(' ');
const embedding = Array.from({ length: 8 }, (_, i) => Math.cos(chunk.length * (i + 1)));
(0, node_fs_1.writeFileSync)('vector_db_auth.json', JSON.stringify({ chunks: [{ id: 'hotfix_001', text: chunk, embedding }] }, null, 2));
console.log(`Agent A: patch validé + chunk Vector DB écrit (${chunk.length} chars ~${Math.round(chunk.length / 4)} tokens), proof=${(0, node_fs_1.readFileSync)('vector_db_auth.json', 'utf8').length}b`);
