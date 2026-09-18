'use strict';

function selectPeers(agentId, peers, options = {}) {
  const fanout = Math.max(1, Number(options.fanout) || 2);
  const candidates = (Array.isArray(peers) ? peers : []).filter((peer) => peer && peer.id !== agentId);
  const seed = String(agentId || '').split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return candidates.slice(seed % Math.max(1, candidates.length)).concat(candidates).slice(0, fanout);
}

function shouldForward(message, seen, now = Date.now()) {
  if (!message?.id || seen.has(message.id)) return false;
  if (message.expiresAt && message.expiresAt <= now) return false;
  seen.add(message.id);
  return true;
}

function nextHop({ message, agentId, peers, seen, options = {} }) {
  if (!shouldForward(message, seen, options.now)) return [];
  return selectPeers(agentId, peers, options).map((peer) => ({ peerId: peer.id, messageId: message.id }));
}

module.exports = { selectPeers, shouldForward, nextHop };
