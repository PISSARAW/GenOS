// queries.ts - Dème DB : sait faire des requêtes groupées, mais ne connaît pas l'UI.
import type { UserProfile } from './user_feed';

export interface UserSummary { id: number; name: string; }

const USERS: UserSummary[] = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, name: `user_${i + 1}` }));

// Requête groupée (JOIN côté base) : UNE ligne de résultat par utilisateur, un seul accès.
export function queryUsersWithProfiles(): { summary: UserSummary; profile: UserProfile }[] {
  // équivalent SQL: SELECT u.id, u.name, p.bio FROM users u JOIN profiles p ON p.user_id = u.id;
  return USERS.map((u) => ({ summary: u, profile: { id: u.id, bio: `bio de ${u.name}` } }));
}
