"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// worker_v1.ts - Worker GenOS AVANT adaptation : martèle l'API (stress détecté).
const labyrinth_1 = require("./labyrinth");
let failures = 0;
const log = [];
for (let p = 1; p <= 12; p += 1) {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
        const { obscureToken } = require('./labyrinth');
        log.push((0, labyrinth_1.callUnstableApi)(obscureToken(Math.floor(Date.now() / 400)), `w1-${p}`));
    }
    catch (err) {
        if (err instanceof labyrinth_1.RateLimitError) {
            failures += 1;
        }
        log.push(`STRESS: ${err.name}`);
    }
}
console.log(log.slice(-4).join('\n'));
console.log(`WORKER v1: stress mesuré = ${failures} RateLimitError (aucune prudence dans le génome de base)`);
