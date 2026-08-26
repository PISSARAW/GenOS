"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// ui_worker_attempt.ts - tentative de l'agent UI PUR (avant migration).
const user_feed_1 = require("../../src/user_feed");
(0, user_feed_1.resetApiCallCount)();
const lines = (0, user_feed_1.renderFeedPureUi)();
console.log(`UI pur: ${lines.length} lignes rendues, appels API = ${(0, user_feed_1.getApiCallCount)()}`);
console.log(`DIAGNOSTIC UI PUR: rendu correct, mais l'agent UI n'a aucun outil DB -> N+1 invisible (${(0, user_feed_1.getApiCallCount)()} appels pour 30 utilisateurs)`);
