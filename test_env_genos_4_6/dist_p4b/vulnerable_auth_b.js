"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyApiKey = verifyApiKey;
// vulnerable_auth.ts - APRÈS hotfix (plasmide de l'Agent A)
const node_crypto_1 = require("node:crypto");
const API_KEY = Buffer.from('sk_test_4eC39HqLyjWDarjtT1zdp7dc', 'utf8');
// Hotfix: comparaison constant-time + garde de longueur explicite.
function verifyApiKey(candidate) {
    const provided = Buffer.from(candidate, 'utf8');
    if (provided.length !== API_KEY.length) {
        return false;
    }
    return (0, node_crypto_1.timingSafeEqual)(provided, API_KEY);
}
