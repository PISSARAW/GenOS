"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderFeedHybrid = renderFeedHybrid;
// hybrid_feed.ts - génération POST-migration dans agents/ui.
// Le dossier UI contient maintenant db_worker_migrated.yaml : le nouvel agent UI
// hérite de la compétence DB (requête groupée) en plus de la compétence UI.
const user_feed_1 = require("../../src/user_feed");
const queries_1 = require("../../src/queries");
function renderFeedHybrid() {
    const rows = (0, queries_1.queryUsersWithProfiles)(); // UNE requête groupée (compétence DB migrée)
    return rows.map((r) => `${r.summary.name}: ${r.profile.bio}`);
}
if (require.main === module) {
    (0, user_feed_1.resetApiCallCount)();
    const lines = renderFeedHybrid();
    console.log(`HYBRIDE: ${lines.length} lignes rendues, appels API = ${(0, user_feed_1.getApiCallCount)()}`);
    console.log(`COMPARAISON: pur UI = 31 appels / hybride = ${(0, user_feed_1.getApiCallCount)()} appel`);
}
