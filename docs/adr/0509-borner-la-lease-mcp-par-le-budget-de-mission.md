# ADR 0509 — Borner la lease MCP par le budget de mission

- **Statut** : Accepté et implémenté pour le runtime Codex.
- **Date** : 2026-10-15
- **Domaine** : Leases MCP et échéances d'exécution.
- **Décideurs** : Mainteneur GenOS.
- **Lié à** : ADR 0508, intersection restrictive des leases.

## Contexte

Les serveurs MCP Node et Rust refusent déjà un lease après
`GENOS_MCP_LEASE_EXPIRES_AT`. Le runtime Codex transmettait les outils autorisés,
mais omettait cette échéance. Un serveur MCP survivant à la fermeture de son
parent pouvait donc continuer à accepter les outils du lease après l'échéance
de la mission.

## Décision

Lorsqu'une mission a un délai ou un budget de latence fini, transmettre au
serveur MCP l'échéance absolue la plus proche, en tenant aussi compte d'un plafond
hôte `GENOS_MCP_LEASE_EXPIRES_AT`. Un plafond hôte mal formé devient une échéance
déjà expirée. Node et Rust appliquent cette valeur à chaque appel direct et à
l'énumération des outils. Les missions sans aucune borne conservent la durée de
vie du processus.

## Conséquences

### Positives

- Un serveur MCP isolé cesse d'accepter les outils au plus tard à l'échéance
  bornée de la mission.
- La vérification se répète à chaque appel; elle ne dépend pas du rafraîchissement
  de la liste d'outils affichée au lancement.
- Le test vérifie le minimum des bornes de mission et hôte ainsi que le refus
  d'un plafond hôte mal formé.

### Négatives

- Une mission dont les bornes diffèrent de l'horloge du processus peut voir son
  lease expirer avant un arrêt propre; ce comportement est restrictif.

## Alternatives

- Transmettre uniquement la liste d'outils : rejeté, car elle n'expire pas si le
  serveur MCP survit au runtime parent.
- Prolonger le lease jusqu'au délai le plus long : rejeté, car cela dépasse une
  borne plus stricte de la mission.
