/**
 * GenOS Password Hashing (scrypt, no external dependency)
 */

const crypto = require('crypto');

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
const KEY_LENGTH = 64;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto
    .scryptSync(String(password), salt, KEY_LENGTH, SCRYPT_PARAMS)
    .toString('hex');
  return `scrypt$${SCRYPT_PARAMS.N}$${SCRYPT_PARAMS.r}$${SCRYPT_PARAMS.p}$${salt}$${derived}`;
}

function verifyPassword(password, stored) {
  try {
    const parts = String(stored || '').split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const [, n, r, p, salt, expected] = parts;
    const derived = crypto.scryptSync(
      String(password),
      salt,
      Buffer.from(expected, 'hex').length,
      { N: Number(n), r: Number(r), p: Number(p) }
    );
    const expectedBuffer = Buffer.from(expected, 'hex');
    return (
      derived.length === expectedBuffer.length &&
      crypto.timingSafeEqual(derived, expectedBuffer)
    );
  } catch {
    return false;
  }
}

module.exports = { hashPassword, verifyPassword };
