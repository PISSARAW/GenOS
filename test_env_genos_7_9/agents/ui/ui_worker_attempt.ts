// ui_worker_attempt.ts - tentative de l'agent UI PUR (avant migration).
import { renderFeedPureUi, resetApiCallCount, getApiCallCount } from '../../src/user_feed';

resetApiCallCount();
const lines = renderFeedPureUi();
console.log(`UI pur: ${lines.length} lignes rendues, appels API = ${getApiCallCount()}`);
console.log(`DIAGNOSTIC UI PUR: rendu correct, mais l'agent UI n'a aucun outil DB -> N+1 invisible (${getApiCallCount()} appels pour 30 utilisateurs)`);
