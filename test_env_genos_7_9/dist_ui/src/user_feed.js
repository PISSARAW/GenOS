"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetApiCallCount = resetApiCallCount;
exports.getApiCallCount = getApiCallCount;
exports.listUsers = listUsers;
exports.getUserProfile = getUserProfile;
exports.renderFeedPureUi = renderFeedPureUi;
let apiCalls = 0;
function resetApiCallCount() { apiCalls = 0; }
function getApiCallCount() { return apiCalls; }
// "Backend" simulé : deux endpoints réels côté instrumentation.
const USERS = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, name: `user_${i + 1}` }));
const PROFILES = new Map(USERS.map((u) => [u.id, { id: u.id, bio: `bio de ${u.name}` }]));
function listUsers() {
    apiCalls += 1;
    return USERS;
}
function getUserProfile(id) {
    apiCalls += 1; // UN appel par utilisateur : c'est le N+1
    const profile = PROFILES.get(id);
    if (!profile) {
        throw new Error(`no profile ${id}`);
    }
    return profile;
}
// Vue UI pure : l'agent UI "optimise" le rendu mais ne voit pas les appels réseau.
function renderFeedPureUi() {
    const users = listUsers();
    const lines = [];
    for (const u of users) {
        const profile = getUserProfile(u.id);
        lines.push(`${u.name}: ${profile.bio}`);
    }
    return lines;
}
