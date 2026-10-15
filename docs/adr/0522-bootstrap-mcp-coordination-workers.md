# ADR 0522 — Amorcer la coordination MCP des workers

## Statut

Accepté.

## Contexte

Le préflight d'un worker vérifiait seulement que les outils MCP loués figuraient dans le catalogue. Le modèle pouvait ensuite chercher ces outils comme des ressources ou dans un registre interne, conclure à tort qu'ils étaient absents et terminer sans communication persistée.

## Décision

Pour une mission à coordination continue, le runtime exécute avant le modèle un handshake MCP sous l'identité authentifiée du worker :

1. lecture de l'état d'organisation ;
2. publication d'un signal direct et d'un signal partagé ;
3. lecture bornée de la boîte jusqu'à réception d'un message pair ;
4. accusé de réception des messages compris ;
5. réponse persistée avec `in_reply_to`.

Le reçu complet est ajouté au prompt comme preuve runtime vérifiée. Un handshake incomplet fait échouer le préflight au lieu de laisser le modèle revendiquer un succès sans preuve.

## Conséquences

La connaissance de l'identité sociale et le minimum de communication exigé ne dépendent plus d'une consigne probabiliste. Le délai est borné à trente secondes et ne s'applique qu'aux missions dont la topologie ou la cadence exige une coordination continue.
