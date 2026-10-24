# ADR 0744 — Invocation GCI liée et autorité par capacité

- **Statut** : Accepté
- **Date** : 2026-10-24
- **Domaine** : GCI, adaptateurs liés, IAM
- **Décideurs** : GenOS
- **Lié à** : ADR 0742, ADR 0743

## Contexte

Le pilote `PROMOTION_GATE` doit être invocable par un consommateur après résolution,
liaison et adoption d'une installation GCI. Appeler directement la route interne
d'approbation contournerait la validation de l'installation, du digest et de la
révocation, et ne produirait pas de reçu GCI.

L'autorité IAM doit rester liée à la capacité qui la requiert. Une permission
accordée pour un export ne peut pas satisfaire les exigences d'un autre export ou
d'une dépendance.

## Décision

Ajouter `POST /api/gci/v1/projects/:projectId/invocations`, protégé par
`gci:invoke` et la portée tenant/projet. L'adaptateur Linked vérifie l'installation
active, le verrou, le digest d'export, les contrats, les révocations et l'autorité
de chaque capacité de la fermeture de dépendances avant d'appeler son handler.
L'invocation écrit un reçu dans le journal GCI.

La route d'approbation de stratégie est exposée uniquement par le handler
`PROMOTION_GATE`. L'autorité `workspace:write` est réévaluée en IAM pour chaque
capacité, avec l'identifiant de capacité et la portée tenant/projet dans la
ressource. Les permissions ne sont jamais agrégées entre capacités.

## Conséquences

### Positives

- Les consommateurs Linked passent par les vérifications et reçus GCI.
- Une clé peut avoir `gci:invoke` sans porter elle-même `workspace:write`.
- Une politique IAM peut accorder l'écriture à une seule capacité dans un seul projet.

### Négatives

- Les déploiements consommateurs doivent accorder séparément `gci:invoke` et
  l'autorité métier ciblée.
- L'invocation distante reste limitée aux handlers explicitement enregistrés.

## Alternatives

- Appeler directement la route métier : rejeté, car cela contourne les contrôles
  GCI et ne crée pas de reçu d'invocation.
- Agréger les autorisations du projet : rejeté, car une permission d'une capacité
  pourrait satisfaire une autre capacité.
