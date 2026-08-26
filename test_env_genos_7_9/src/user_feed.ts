// user_feed.ts - Dème UI : composant qui souffre d'un N+1 invisible côté UI.
export interface UserSummary { id: number; name: string; }
export interface UserProfile { id: number; bio: string; }

let apiCalls = 0;
export function resetApiCallCount(): void { apiCalls = 0; }
export function getApiCallCount(): number { return apiCalls; }

// "Backend" simulé : deux endpoints réels côté instrumentation.
const USERS: UserSummary[] = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, name: `user_${i + 1}` }));
const PROFILES = new Map<number, UserProfile>(USERS.map((u) => [u.id, { id: u.id, bio: `bio de ${u.name}` }]));

export function listUsers(): UserSummary[] {
  apiCalls += 1;
  return USERS;
}

export function getUserProfile(id: number): UserProfile {
  apiCalls += 1; // UN appel par utilisateur : c'est le N+1
  const profile = PROFILES.get(id);
  if (!profile) { throw new Error(`no profile ${id}`); }
  return profile;
}

// Vue UI pure : l'agent UI "optimise" le rendu mais ne voit pas les appels réseau.
export function renderFeedPureUi(): string[] {
  const users = listUsers();
  const lines: string[] = [];
  for (const u of users) {
    const profile = getUserProfile(u.id);
    lines.push(`${u.name}: ${profile.bio}`);
  }
  return lines;
}
