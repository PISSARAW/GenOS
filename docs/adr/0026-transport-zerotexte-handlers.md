# ADR 0026 — Intégration sélective du transport zéro-texte aux handlers

- **Statut** : Accepté
- **Date** : 2026-09-19
- **Domaine** : orchestration, signalisation inter-agents
- **Lié à** : [contrat des topologies](../02-orchestration/topologies-et-capacites.md), [handlers biomimétiques](../01-concepts/biomimicry-handlers.md)

## Contexte

Le transport zéro-texte et les handlers biomimétiques ont des rôles distincts.
Les handlers peuvent exécuter une opération locale via le CLI Rust ; seuls les
résultats destinés à la coordination inter-agents doivent entrer dans le canal
de l'organisation. Publier automatiquement chaque résultat risquerait de
répandre des données hors contexte et donnerait un faux contrat de signal pour
des opérations sans sémantique de coordination.

## Décision

La publication inter-agents reste opt-in et passe par
`dynamicOrganizationService.publish`, qui vérifie l'appartenance, applique le
routage de l'organisation et persiste le signal structuré dans l'inbox.
Le handler `genos_biomimicry_stigmergy` publie ses dépôts en signal `pheromone`
quand l'appel fournit `orchestrator_id` et `agent_id`. L'exécution locale Rust
reste la source de l'opération de stigmergie ; le signal expose sa trace au
collectif sans publier le texte de sa sortie.

Les autres handlers ne publient pas automatiquement leurs résultats. Chaque
nouvelle intégration doit définir le type, le contenu borné et le destinataire
du signal métier, puis conserver les vérifications du canal d'organisation.

## Conséquences

- Sans `orchestrator_id`, le handler de stigmergie conserve le chemin local.
- Avec l'identifiant, l'émetteur doit être membre de l'organisation active. Si
  la publication échoue après le dépôt local, le résultat indique
  `completed_signal_error` et expose l'erreur de transport.
- Le transport ne remplace ni le calcul local, ni le retour MCP à l'appelant.
- La diffusion cross-processus/cluster n'est pas garantie par cette décision.
