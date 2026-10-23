# ADR 0731 — Porte commune du cycle de vie par contrat d'opération

- **Statut** : Accepté
- **Date** : 2026-10-23
- **Domaine** : architecture transversale, contrats d'opération, evidence, budgets, leases, snapshots
- **Décideurs** : mainteneurs GenOS
- **Lié à** : ADR 0343, ADR 0537, ADR 0730, shared/operationContracts.v1.json

## Contexte

Le dépôt possède déjà un contrat transversal versionné (`shared/operationContracts.v1.json`
et `backend/src/services/operationContractService.js`) décrivant enveloppe d'opération, budget,
autorité, reçu terminal et preuve. Toutefois, les portes d'admission, d'exécution et de
clôture varient selon les parcours (API, CLI, MCP, orchestration, workers, reprise). Un
transport réussi ou un statut `complete` peut encore être traité comme une réussite sans
preuve suffisante.

## Décision

Le contrat d'opération existant devient la **porte commune du cycle de vie** pour toutes
les entrées du produit. Chaque opération doit porter son identité corrélée, son budget, son
autorité et ses conditions d'arrêt ; chaque résultat produit un reçu terminal avec statut et
preuves référencées.

Les contrôles sont centralisés dans `backend/src/services/operationLifecycleGate.js`
(alias : `operationContractGate`, `commonOperationGate`, `operationGateService`,
`commonLifecycleGate`, `lifecycleGateService`, `operationLifecycleGateService`) :

1. **Admission** : vérifier l'autorisation, la lease, le budget et le périmètre. Refuser
   toute opération manquante ou hors budget.
2. **Exécution** : débiter les ressources et permettre la révocation de l'autorité.
3. **Clôture / reprise** : vérifier le reçu, les preuves et l'état du snapshot.

Invariants explicites :

- **Snapshot** : intègre, lié à la branche et à l'exécution, accompagné d'un reçu de
  capture ou de restauration (`validateSnapshot`).
- **Budget** : mesuré, transmis aux descendants et conservé lors d'une reprise ; l'épuisement
  bloque l'opération (`validateBudgetTransmission`, `isBudgetExhausted`, `debitBudget`).
- **Lease** : vérifiée au moment d'agir, limitée en portée et en durée, révocable
  (`validateLease`, `revokeAuthority`).
- **Preuve** : typée, traçable et liée au claim qu'elle soutient ; un transport réussi ou un
  statut `complete` ne suffit pas à autoriser une promotion (`validateEvidenceForClaim`,
  `canPromote`).

Un passage de migration par adaptateurs (`adaptLegacy`) adopte la porte commune sans
réécrire tous les mécanismes d'un coup : les parcours qui ne fournissent pas les champs
requis sont refusés ou marqués explicitement `partial`/`unavailable`.

Une matrice de conformité (`complianceMatrix`) et des tests de contrat couvrent chaque entrée
et chaque état terminal, y compris après redémarrage, rejeu ou reprise.

## Conséquences

- Aucun chemin d'exécution ou de promotion ne peut contourner ces contrôles sans passer par
  la porte commune.
- Chaque décision est reconstructible à partir de ses reçus et preuves.
- Les mécanismes existants restent en place ; la porte commune les orchestre plutôt que de
  les remplacer.
- Les parcours legacy sont marqués `partial`/`unavailable` jusqu'à adoption complète.

## Alternatives

- Réécrire tous les mécanismes d'un coup : rejeté, trop risqué et non incrémental.
- Faire confiance au statut `complete` : rejeté, car un statut terminal ne constitue pas une
  preuve.
- Laisser chaque service implémenter sa propre porte : rejeté, car cela maintient la
  dispersion actuelle.
