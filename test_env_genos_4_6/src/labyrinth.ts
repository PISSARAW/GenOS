// labyrinth.ts - API instable : rate limit aléatoire + token obscur obligatoire.
// Le token valide n'est produit que par une fonction obscure non documentée.
const SECRET_SALT = 0x5f3759df;

export class RateLimitError extends Error {
  public constructor(public readonly retryAfterMs: number) {
    super('Rate Limit Exceeded');
    this.name = 'RateLimitError';
  }
}

export class AuthError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

// Fonction obscure : aucun agent ne peut la deviner sans exploration.
export function obscureToken(windowIndex: number): string {
  const x = (windowIndex ^ SECRET_SALT) >>> 0;
  const mixed = Math.imul(x, 0x85ebca6b) >>> 0;
  const folded = (mixed ^ (mixed >>> 13)) >>> 0;
  return `tok_${folded.toString(16).padStart(8, '0')}`;
}

const WINDOW_MS = 400;
const MAX_CALLS_PER_WINDOW = 2;

let windowStart = Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS;
let callsInWindow = 0;

function rotateWindowIfNeeded(): void {
  const alignedNow = Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS;
  if (alignedNow > windowStart) {
    windowStart = alignedNow;
    callsInWindow = 0;
  }
}

// API protégée : exige le token du fenêtre courante ET respecte le quota.
export function callUnstableApi(token: string, payload: string): string {
  rotateWindowIfNeeded();
  if (callsInWindow >= MAX_CALLS_PER_WINDOW) {
    throw new RateLimitError(WINDOW_MS - (Date.now() - windowStart));
  }
  const expected = obscureToken(Math.floor(windowStart / WINDOW_MS));
  if (token !== expected) {
    throw new AuthError(`invalid token '${token}' (expected format tok_xxxxxxxx)`);
  }
  callsInWindow += 1;
  return `OK(${payload})@${windowStart}`;
}
