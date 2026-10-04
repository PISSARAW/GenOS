# ADR 0302 — Autorité des actions de récepteurs

- **Statut** : Accepté
- **Date** : 2026-10-04
- **Domaine** : Communication, signalisation, isolation des projets
- **Décideurs** : GenOS
- **Lié à** : [Signal Plane](../01-concepts/signal-plane-zero-text.md), [ADR 0300](0300-checkpoint-communication-fin-mission.md)

## Contexte

Le registre de récepteurs déclenchait des actions déterministes dès qu'un
ligand atteignait son seuil. Une action `wake_worker` ou `update_agent` pouvait
nommer un agent hors du projet de l'émetteur, même si le routeur excluait cet
agent des destinataires. Un succès de transport ne prouve pas l'autorité de
l'action.

## Décision

Le chemin de publication vérifie l'autorité de chaque action avant le dispatch.
L'émetteur doit être un orchestrateur rattaché à une organisation et à un
projet. Les actions ciblant un worker exigent aussi que la cible soit un
destinataire routé, un enfant de cet orchestrateur et dans le même périmètre.
Un refus laisse l'action non exécutée et active l'escalade cognitive prévue
quand aucun autre récepteur n'a réussi.

Le registre reste local au processus. La persistance de règles actives est
reportée jusqu'à disposer d'un contrat d'administration et d'une identité
d'appelant vérifiée. Le champ `agent_id` des outils MCP n'est pas une preuve
d'identité.

## Conséquences

- Une règle ciblant un autre projet ne peut plus modifier son agent via le
  chemin de publication.
- Les récepteurs exécutés directement en mémoire gardent leur API de test ;
  l'autorité est appliquée au chemin de transport de production.
- Un appelant capable d'usurper l'identifiant d'un orchestrateur via MCP reste
  une limite du transport actuel ; cette décision ne prétend pas l'authentifier.

## Alternatives

- Persister immédiatement les règles existantes : rejeté, car cela rendrait
  durable une configuration d'actions sans autorité vérifiée.
