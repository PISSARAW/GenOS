// expert_attack.ts - "Agent Expert" classique : attaque l'API sans connaissance préalable.
import { readFileSync } from 'node:fs';
import { callUnstableApi, RateLimitError } from './labyrinth';

const log: string[] = [];
let failures = 0;

function attempt(token: string, payload: string): void {
  try {
    const res = callUnstableApi(token, payload);
    log.push(`SUCCESS ${res}`);
  } catch (err) {
    failures += 1;
    log.push(`FAIL(${failures}): ${(err as Error).name}: ${(err as Error).message}`);
  }
}

// Stratégie naïve de l'expert : il "sait" que le format est tok_xxxxxxxx mais pas la fonction.
for (let i = 1; i <= 4; i += 1) {
  attempt(`tok_${i.toString(16).padStart(8, '0')}`, 'page-1');
}

// Il lit alors le code source (coût d'exploration) et découvre obscureToken().
const source = readFileSync('src/labyrinth.ts', 'utf8');
log.push('ACTION: lecture de src/labyrinth.ts -> découverte de obscureToken(windowIndex)');

// eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
const { obscureToken } = require('./labyrinth') as typeof import('./labyrinth');

// Puis il martèle l'API pour récupérer les données : 12 appels rapprochés.
for (let p = 1; p <= 12; p += 1) {
  attempt(obscureToken(Math.floor(Date.now() / 400)), `page-${p}`);
}

console.log(log.join('\n'));
console.log(`TOTAL: ${failures} échecs réels avant de stabiliser l'accès`);

// L'expert enregistre sa solution dans une Vector DB (chunk + embedding factice déterministe).
const chunk = [
  'SOLUTION API INSTABLE:',
  '1. Le token vaut obscureToken(floor(now/400)) - fonction imul/xor dans labyrinth.ts.',
  '2. Respecter un quota de 2 appels par fenêtre de 400ms.',
  '3. Astuce mémorisée: attendre ~100ms entre les appels suffit. (OBSOLÈTE: quota réel dépassé)',
].join(' ');
const embedding = Array.from({ length: 8 }, (_, i) => Math.sin(chunk.length * (i + 1)) );
require('node:fs').writeFileSync('vector_db.json', JSON.stringify({ chunks: [{ id: 'sol_001', text: chunk, embedding }] }, null, 2));
console.log(`Vector DB écrite: chunk de ${chunk.length} chars (~${Math.round(chunk.length / 4)} tokens)`);
