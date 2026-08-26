// hybrid_feed.ts - génération POST-migration dans agents/ui.
// Le dossier UI contient maintenant db_worker_migrated.yaml : le nouvel agent UI
// hérite de la compétence DB (requête groupée) en plus de la compétence UI.
import { resetApiCallCount, getApiCallCount } from '../../src/user_feed';
import { queryUsersWithProfiles } from '../../src/queries';

export function renderFeedHybrid(): string[] {
  const rows = queryUsersWithProfiles(); // UNE requête groupée (compétence DB migrée)
  return rows.map((r) => `${r.summary.name}: ${r.profile.bio}`);
}

if (require.main === module) {
  resetApiCallCount();
  const lines = renderFeedHybrid();
  console.log(`HYBRIDE: ${lines.length} lignes rendues, appels API = ${getApiCallCount()}`);
  console.log(`COMPARAISON: pur UI = 31 appels / hybride = ${getApiCallCount()} appel`);
}
