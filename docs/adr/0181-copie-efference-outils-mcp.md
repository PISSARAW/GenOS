# ADR 0181 — Corréler les outils MCP du backend à la copie d'efférence

- **Statut** : Accepté
- **Date** : 2026-09-30
- **Domaine** : Runtime Node, exécution MCP et attribution soi/monde
- **Décideurs** : GenOS maintainers
- **Lié à** : `docs/01-concepts/indicateurs-fonctionnels.md`, `shared/effectorRegistry.json`

## Contexte

La copie d'efférence couvre déjà les actions déclenchées par
`orchestrationActionExecutor`, mais des outils MCP exécutés par le backend
peuvent produire leurs propres effets. Sans prédiction par appel et reçu de
résultat corrélé, leur événement ne peut pas être attribué à l'action qui l'a
produit. Les autres voies d'action doivent aussi être visibles dans un
inventaire explicite, y compris lorsqu'elles restent non couvertes.

## Décision

Après les contrôles d'autorisation et juste avant l'exécution transport MCP,
`mcpExecutor.execute` enregistre une prédiction avec un ID d'action unique.
Les événements de succès et d'échec portent ce même `sourceActionId`. Le registre
`effectorRegistry.json` déclare les voies du profil Node et distingue les
voies couvertes, non couvertes, sans identité d'agent et hors périmètre Node.

## Conséquences

### Positives

- Les appels MCP backend disposent d'une corrélation action → résultat utilisable
  par `efferenceCopyService`.
- L'inventaire rend visibles les voies encore non raccordées au lieu de les
  compter comme validées.
- L'enregistrement est best-effort et intervient après les gates de sécurité.

### Négatives

- Les mutations faites directement par un processus de modèle ou un serveur MCP
  stdio restent sans copie par mutation.
- L'ID d'action corrèle une prédiction à un reçu logiciel ; il ne prouve pas la
  causalité physique ni la qualité d'une attribution soi/monde.

## Alternatives

- Prédire au niveau du seul orchestrateur : rejeté, car les appels MCP directs
  du backend restent sans corrélation.
- Traiter tous les appels comme attribués au soi : rejeté, car plusieurs voies
  n'exposent pas d'identité d'agent ou de reçu corrélé.
