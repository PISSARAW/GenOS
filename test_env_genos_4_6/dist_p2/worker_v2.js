"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// worker_v2.ts - Worker piloté par son génome MUTÉ + marqueur épigénétique.
// Il lit api_worker.yaml : backoff_patience=0.85 et epigenetic_marker(exploration)=0.8
// => phénotype prudent : backoff = retryAfterMs + marge proportionnelle à la prudence.
const node_fs_1 = require("node:fs");
const labyrinth_1 = require("./labyrinth");
const genome = (0, node_fs_1.readFileSync)('api_worker.yaml', 'utf8');
function drive(name) {
    const match = new RegExp(`gene_name: ${name}\\n\\s+value: ([0-9.]+)`).exec(genome);
    return match ? Number(match[1]) : 0.5;
}
function marker(name) {
    const match = new RegExp(`gene_name: ${name}\\n\\s+value: [0-9.]+\\n\\s+epigenetic_marker: ([0-9.]+)`).exec(genome);
    return match ? Number(match[1]) : 0;
}
const patience = drive('backoff_patience'); // 0.85 (acquis par mutation)
const explorationMasked = marker('exploration'); // 0.80 (marqueur épigénétique)
console.log(`Génome lu: backoff_patience=${patience}, epigenetic_marker(exploration)=${explorationMasked} (exploration masquée)`);
// eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
const { obscureToken } = require('./labyrinth');
let successes = 0;
let failures = 0;
// Prudence épigénétique PROACTIVE : cadence = fenêtre / (quota × prudence), avant tout appel.
const pacingMs = Math.round((400 / 2) * (1 + patience));
for (let p = 1; p <= 12; p += 1) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, pacingMs);
    try {
        (0, labyrinth_1.callUnstableApi)(obscureToken(Math.floor(Date.now() / 400)), `w2-${p}`);
        successes += 1;
    }
    catch (err) {
        if (!(err instanceof labyrinth_1.RateLimitError)) {
            throw err;
        }
        failures += 1;
        // Repli réactif : attente = retryAfterMs + marge proportionnelle au trait acquis.
        const margin = Math.round(400 * patience);
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, err.retryAfterMs + margin);
    }
}
console.log(`WORKER v2: ${successes} succès / ${failures} RateLimitError subis (vs 2/10 en v1) - adaptation sans changement de nature`);
