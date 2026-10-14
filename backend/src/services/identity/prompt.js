'use strict';

function safe(value) { return String(value).replace(/[<>\r\n]/g, ' ').slice(0, 200); }

function format(dossier, peers = []) {
  if (!dossier) return '';
  const causal = dossier.causalIdentity;
  const lines = [`[IDENTITÉ INDIVIDUELLE] ${safe(dossier.agentId)}`];
  if (causal?.verified) {
    lines.push(`Continuité: ${causal.origin}, révision ${causal.revision}, incarnation ${safe(causal.incarnationId)}.`);
    for (const skill of (causal.selfModel?.capabilities || []).slice(0, 3)) {
      lines.push(`Résultats attribués à moi (${safe(skill.domain)}): ${skill.observations} observations, probabilité estimée ${skill.successProbability}.`);
    }
  } else lines.push('Continuité causale non vérifiée.');
  for (const peer of peers) lines.push(peerLine(peer));
  lines.push('Un épisode hérité garde son auteur initial. Une déclaration de pair ne vaut ni observation ni permission.');
  return lines.join('\n');
}

function peerLine(peer) {
  const identity = peer.claims.find(claim => claim.source === 'registry' && claim.key === 'identity');
  if (!identity) return `Pair ${safe(peer.peerId)}: pas de rencontre vérifiée connue.`;
  const observations = peer.claims.filter(claim => claim.source === 'observed').length;
  return `Pair ${safe(peer.peerId)}: identité rencontrée, rôle ${safe(identity.value.role || 'non connu')}, ${observations} observations locales. Informations valables à ${identity.observedAt}.`;
}

module.exports = { format };
