// CryptoEngine.ts - Généré par "Child_Crypto" (génome issu de breed).
// Traits hérités : risk_tolerance≈0.25 (sécurité stricte) × exploration/syntax_strictness élevés
// (performance + hygiène). Besoin combiné : chiffrement authentifié haute-performance.
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

export interface CipherResult { readonly nonce: Buffer; readonly ciphertext: Buffer; readonly tag: Buffer; }

const KEY_BYTES = 32;
const NONCE_BYTES = 12;

export class CryptoEngine {
  private readonly cache = new Map<string, { key: Buffer; cipherCount: number }>();

  public deriveKey(masterSecret: Buffer, context: string): Buffer {
    const cached = this.cache.get(context);
    if (cached !== undefined) { return this.audit(cached.key, context); }
    return this.expandKey(masterSecret, context);
  }

  // Chemin "hot" : chiffre N payloads en réutilisant la clé dérivée (perf parent).
  public encryptBatch(key: Buffer, plaintexts: readonly Buffer[]): CipherResult[] {
    const results: CipherResult[] = new Array(plaintexts.length);
    for (let i = 0; i < plaintexts.length; i += 1) { results[i] = this.encryptOne(key, plaintexts[i]); }
    return results;
  }

  public decryptOne(key: Buffer, sealed: CipherResult): Buffer {
    const decipher = createDecipheriv('aes-256-gcm', key, sealed.nonce);
    decipher.setAuthTag(sealed.tag);
    return Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()]);
  }

  private encryptOne(key: Buffer, plaintext: Buffer): CipherResult {
    const nonce = randomBytes(NONCE_BYTES); // jamais de nonce réutilisé (parent sécurité)
    const sealed = this.seal(key, nonce, plaintext);
    return { nonce, ...sealed };
  }

  private seal(key: Buffer, nonce: Buffer, plaintext: Buffer): { ciphertext: Buffer; tag: Buffer } {
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return { ciphertext, tag: cipher.getAuthTag() };
  }

  private expandKey(masterSecret: Buffer, context: string): Buffer {
    if (masterSecret.length !== KEY_BYTES) { throw new Error(`master secret must be ${KEY_BYTES} bytes`); }
    return this.cacheAndReturn(this.hkdfLike(masterSecret, context), context);
  }

  private cacheAndReturn(key: Buffer, context: string): Buffer {
    this.cache.set(context, { key, cipherCount: 0 });
    return key;
  }

  private hkdfLike(masterSecret: Buffer, context: string): Buffer {
    const salt = Buffer.alloc(KEY_BYTES, 0); // sel fixe : dérivation déterministe par contexte
    const info = Buffer.from(context, 'utf8');
    return Buffer.from(hkdfSync('sha256', masterSecret, salt, info, KEY_BYTES));
  }

  public wipe(context: string): void {
    this.cache.delete(context);
  }

  public verifyKeyIntegrity(key: Buffer, context: string): boolean {
    const entry = this.cache.get(context);
    return entry !== undefined && timingSafeEqual(entry.key, key);
  }

  private audit(key: Buffer, context: string): Buffer {
    const entry = this.cache.get(context);
    if (entry === undefined || !entry.key.equals(key)) { throw new Error('key cache desynchronized'); }
    return this.bump(entry, key);
  }

  private bump(entry: { key: Buffer; cipherCount: number }, key: Buffer): Buffer {
    entry.cipherCount += 1;
    return key;
  }
}

