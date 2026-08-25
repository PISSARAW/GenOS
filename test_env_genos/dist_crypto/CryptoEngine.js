"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CryptoEngine = void 0;
// CryptoEngine.ts - Généré par "Child_Crypto" (génome issu de breed).
// Traits hérités : risk_tolerance≈0.25 (sécurité stricte) × exploration/syntax_strictness élevés
// (performance + hygiène). Besoin combiné : chiffrement authentifié haute-performance.
const node_crypto_1 = require("node:crypto");
const KEY_BYTES = 32;
const NONCE_BYTES = 12;
class CryptoEngine {
    constructor() {
        this.cache = new Map();
    }
    deriveKey(masterSecret, context) {
        const cached = this.cache.get(context);
        if (cached !== undefined) {
            return this.audit(cached.key, context);
        }
        return this.expandKey(masterSecret, context);
    }
    // Chemin "hot" : chiffre N payloads en réutilisant la clé dérivée (perf parent).
    encryptBatch(key, plaintexts) {
        const results = new Array(plaintexts.length);
        for (let i = 0; i < plaintexts.length; i += 1) {
            results[i] = this.encryptOne(key, plaintexts[i]);
        }
        return results;
    }
    decryptOne(key, sealed) {
        const decipher = (0, node_crypto_1.createDecipheriv)('aes-256-gcm', key, sealed.nonce);
        decipher.setAuthTag(sealed.tag);
        return Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()]);
    }
    encryptOne(key, plaintext) {
        const nonce = (0, node_crypto_1.randomBytes)(NONCE_BYTES); // jamais de nonce réutilisé (parent sécurité)
        const sealed = this.seal(key, nonce, plaintext);
        return { nonce, ...sealed };
    }
    seal(key, nonce, plaintext) {
        const cipher = (0, node_crypto_1.createCipheriv)('aes-256-gcm', key, nonce);
        const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
        return { ciphertext, tag: cipher.getAuthTag() };
    }
    expandKey(masterSecret, context) {
        if (masterSecret.length !== KEY_BYTES) {
            throw new Error(`master secret must be ${KEY_BYTES} bytes`);
        }
        return this.cacheAndReturn(this.hkdfLike(masterSecret, context), context);
    }
    cacheAndReturn(key, context) {
        this.cache.set(context, { key, cipherCount: 0 });
        return key;
    }
    hkdfLike(masterSecret, context) {
        const salt = Buffer.alloc(KEY_BYTES, 0); // sel fixe : dérivation déterministe par contexte
        const info = Buffer.from(context, 'utf8');
        return Buffer.from((0, node_crypto_1.hkdfSync)('sha256', masterSecret, salt, info, KEY_BYTES));
    }
    wipe(context) {
        this.cache.delete(context);
    }
    verifyKeyIntegrity(key, context) {
        const entry = this.cache.get(context);
        return entry !== undefined && (0, node_crypto_1.timingSafeEqual)(entry.key, key);
    }
    audit(key, context) {
        const entry = this.cache.get(context);
        if (entry === undefined || !entry.key.equals(key)) {
            throw new Error('key cache desynchronized');
        }
        return this.bump(entry, key);
    }
    bump(entry, key) {
        entry.cipherCount += 1;
        return key;
    }
}
exports.CryptoEngine = CryptoEngine;
