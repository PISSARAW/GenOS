"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.queryUsersWithProfiles = queryUsersWithProfiles;
const USERS = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, name: `user_${i + 1}` }));
// Requête groupée (JOIN côté base) : UNE ligne de résultat par utilisateur, un seul accès.
function queryUsersWithProfiles() {
    // équivalent SQL: SELECT u.id, u.name, p.bio FROM users u JOIN profiles p ON p.user_id = u.id;
    return USERS.map((u) => ({ summary: u, profile: { id: u.id, bio: `bio de ${u.name}` } }));
}
