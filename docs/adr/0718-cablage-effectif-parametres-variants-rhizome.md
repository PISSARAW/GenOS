# ADR 0718 — Câblage effectif des paramètres de variants Rhizome

- **Statut :** Accepté
- **Date :** 2026-10-22
- **Domaine :** Rhizome, variants, routage, croissance, résilience, confidentialité
- **Décideurs :** équipe GenOS
- **Lié à :** ADR 0130, ADR 0421, ADR 0434

## Contexte

Les douze variants Rhizome (`persistent`, `ephemeral`, `exploratory`, `routing`, `growth`,
`resilient`, `sparse`, `small_world`, `private`, `cross_representation`, `procedural`,
`self_healing`) exposaient des paramètres dans `variantPolicyService.js` qui n'étaient pas
tous consommés par le runtime. ADR 0130 exige qu'un variant influence une opération
vérifiable plutôt que de servir de métadonnée. L'audit a identifié plusieurs champs déclarés
mais inertes : `trustBound`, `quarantineDuration`, `minRedundantPaths`,
`recoveryReserveRatio`, `heteroBridgeCompat`, `pipelineDepth`, `conductivityWeight`,
`maxBranches` (sparse) et `tau` (température).

## Décision

Les paramètres de profil sont raccordés aux opérations qu'ils doivent gouverner :

1. `sparse` applique automatiquement `maxBranches=4`, `maxDepth=4`, `minBranchBudget=2000`
   et `maxDensity` lors de `composeRhizome`, sauf si l'appelant fournit explicitement
   `growthLimits`.
2. `tau` du profil de conductivité devient la température par défaut du routage softmax
   (`probabilisticRouteService`), sauf surcharge explicite par l'appelant.
3. `private.trustBound` filtre les nœuds dont la fiabilité est sous le seuil dans
   `routePlanner.activeNodes`.
4. `private.quarantineDuration` fixe la durée de quarantaine des arêtes dans
   `routeQuarantineService`, sauf durée explicite fournie par l'appelant.
5. `resilient.minRedundantPaths` impose un nombre minimal de chemins indépendants dans
   `routePlanner.plan` ; en dessous, le verdict est `insufficient_redundancy`.
6. `resilient.recoveryReserveRatio` réserve une fraction supplémentaire du budget de
   croissance dans `growthBudgetService.availableBudget`.
7. `cross_representation.heteroBridgeCompat` impose un seuil de compatibilité pour les
   ponts dont les représentations source et cible diffèrent, dans
   `bridgeValidationService`.
8. `procedural.pipelineDepth` borne le nombre de cibles propagées dans
   `proceduralPropagationService`.
9. `routing.conductivityWeight` est ajouté au profil et injecté comme poids de conductivité
   dans `routeScoringService.objectiveScore`.

Les variants liés à la session (`persistent`, `ephemeral`, `private`, `cross_representation`,
`procedural`) et le gate `RHIZOME_VARIANT_TRANSITION_REQUIRES_NEW_SESSION` (ADR 0421)
restent inchangés.

## Conséquences

### Positives
- Les profils modifient désormais des opérations observables (routage, croissance, pruning,
  quarantaine, ponts, propagation) au lieu de rester des métadonnées.
- Le budget, la quarantaine et les chemins indépendants sont gouvernés par le variant actif.
- La compatibilité hétérogène et la profondeur de pipeline sont vérifiées au runtime.
- La température de routage stochastic reflète la température du variant.

### Négatives
- `sparse` impose maintenant des limites de croissance par défaut, ce qui peut réduire le
  nombre de branches admissibles si l'appelant ne fournit pas `growthLimits`.
- `minRedundantPaths` peut rendre une mission `resilient` non routable sur un graphe à
  chemin unique (`insufficient_redundancy`).
- `heteroBridgeCompat` refuse un pont hétérogène dont la compatibilité dérivée est sous
  le seuil.

### Paramètres encore non câblés
- `self_healing.autoReconfigure` : aucune reconfiguration automatique au-delà de la
  réparation manuelle.
- `small_world.hubCount` et `hubConnectivity` : la sélection de hubs observés n'utilise pas
  ces seuils.
- `procedural.algorithmSeed` : non consommé, la propagation reste déterministe par tri.
- `exploratory.scoutPriority` : transmis mais ne biaise pas encore la recherche de chemins.

Ces points restants sont différés à une itération ultérieure avec tests dédiés.

## Alternatives

- **Conserver les paramètres comme documentation seulement :** rejeté, car un variant doit
  produire des effets observables (ADR 0130).
- **Câbler tous les paramètres restants dans ce même changement :** rejeté, car
  `autoReconfigure`, la sélection de hubs et le biais de scout nécessitent des services
  supplémentaires et des tests dédiés ; les câbler partiellement masquerait leur absence.
- **Créer un `variantRuntimeService` Rhizome :** différé ; la complexité actuelle est
  gérée par les services existants sans nouvelle couche.