# ADR 0734 — Scope tenantisé et autorité signée avant exécution

- **Statut** : Accepté
- **Date** : 2026-10-24
- **Domaine** : Orchestration, workspace, provenance GVX, sécurité
- **Décideurs** : Mainteneur GenOS
- **Lié à** : [ADR 0731](0731-porte-commune-du-cycle-de-vie-par-contrat-d-operation.md)

## Contexte

Une mission pouvait créer un run sans scope organisation/projet, car la liaison
GVX retournait `null` au lieu de refuser. Le runtime exigeait ensuite une
enveloppe d'autorité, laissant des runs planifiés sans preuve de provenance.
De même, un ledger sans clé HMAC active pouvait enregistrer des événements non
signés avant que le scellement de l'autorité ne les rejette.

## Décision

Toute mission persistée exige un workspace enregistré et lié à une organisation
et à un projet. La création d'un run et de son binding GVX reste dans une seule
transaction, et l'absence de binding requis annule cette transaction. Le backend
doit disposer d'une clé HMAC persistante avant d'admettre une mission; readiness
est indisponible sans clé. Les workspaces découverts sont idempotents par chemin
canonique et les noms sont uniques dans leur tenant.

Un workspace neuf ne reçoit un scope que par ancrage explicite à un workspace
tenantisé existant. GenOS ne déduit jamais le tenant à partir du nom ou du
chemin du dossier.

## Conséquences

### Positives

- Aucun run exécutable ne reste planifié sans scope GVX.
- Les bindings et enveloppes d'autorité sont signés avant le démarrage runtime.
- L'absence de configuration est visible au préflight et dans `/readyz`.
- Un worktree homonyme ne provoque plus une collision de nom non contextualisée.

### Négatives

- Les nouveaux workspaces exigent une inscription tenantisée explicite.
- Les opérateurs doivent provisionner une clé HMAC persistante avant d'activer
  l'orchestration.

## Alternatives

- Accepter les missions sans scope puis échouer au démarrage : rejeté, car cela
  laissait des runs sans binding.
- Générer une clé volatile au démarrage : rejeté, car elle ne permet pas de
  vérifier les événements après redémarrage.
- Inférer le tenant à partir du chemin ou du nom : rejeté, car cette déduction
  n'est pas une preuve d'appartenance.
