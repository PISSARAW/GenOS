// vulnerable_auth.ts - APRÈS hotfix (plasmide de l'Agent A)
import { timingSafeEqual } from 'node:crypto';

const API_KEY = Buffer.from('sk_test_4eC39HqLyjWDarjtT1zdp7dc', 'utf8');

// Hotfix: comparaison constant-time + garde de longueur explicite.
export function verifyApiKey(candidate: string): boolean {
  const provided = Buffer.from(candidate, 'utf8');
  if (provided.length !== API_KEY.length) { return false; }
  return timingSafeEqual(provided, API_KEY);
}

