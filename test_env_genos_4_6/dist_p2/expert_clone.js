"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// expert_clone.ts - Clone de l'expert : contexte VIERGE, doit faire un rappel RAG.
const node_fs_1 = require("node:fs");
const labyrinth_1 = require("./labyrinth");
const db = JSON.parse((0, node_fs_1.readFileSync)('vector_db.json', 'utf8'));
// Embedding de requête déterministe (simulation d'embedder local).
function embed(text) {
    return Array.from({ length: 8 }, (_, i) => Math.sin(text.length * (i + 1)));
}
function cosine(a, b) {
    const dot = a.reduce((s, v, i) => s + v * b[i], 0);
    const na = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
    const nb = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
    return dot / (na * nb);
}
// Coût RAG : requête + parcours de tous les chunks + lecture du chunk retenu.
const query = 'comment appeler l API instable sans rate limit';
const qv = embed(query);
let best = db.chunks[0];
let bestScore = -1;
for (const chunk of db.chunks) {
    const score = cosine(qv, chunk.embedding);
    if (score > bestScore) {
        bestScore = score;
        best = chunk;
    }
}
const ragTokens = Math.round((query.length + best.text.length) / 4);
console.log(`RAG: similarité cosinus=${bestScore.toFixed(3)}, chunk '${best.id}' chargé (~${ragTokens} tokens ingérés)`);
// Le clone applique la solution mémorisée : délai "100ms suffit" (détail obsolète).
const rememberedDelayMs = Number(/~(\d+)ms/.exec(best.text)?.[1] ?? 100);
const log = [];
let failures = 0;
for (let p = 1; p <= 12 && failures < 15; p += 1) {
    try {
        // Le chunk pointe vers labyrinth.ts : le clone doit RE-lire la source (coût supplémentaire).
        // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
        const { obscureToken } = require('./labyrinth');
        const res = (0, labyrinth_1.callUnstableApi)(obscureToken(Math.floor(Date.now() / 400)), `clone-page-${p}`);
        log.push(`SUCCESS ${res}`);
    }
    catch (err) {
        failures += 1;
        log.push(`FAIL(${failures}): ${err.name}: ${err.message}`);
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, rememberedDelayMs);
}
console.log(log.join('\n'));
console.log(`CLONE: ${failures} échecs après rappel RAG (mémoire partielle/obsolète: token figé + délai 100ms < fenêtre 400ms)`);
