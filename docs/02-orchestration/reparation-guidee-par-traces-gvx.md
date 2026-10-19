# Réparation GVX guidée par traces

Le chemin `gvxTraceGuidedRepair` relie une défaillance observée à une expérience
GVX sans confondre corrélation, mutation et promotion :

```text
trace bornée
  → hypothèses causales vérifiées indépendamment
  → loci catalogués et recettes allowlistées
  → maturation d’affinité AEIS
  → mutations mono-locus bornées
  → branches baseline/candidate isolées
  → holdout scellé + métriques vérifiées
  → garde objectif/régression
  → revue externe obligatoire
```

## Contrats

`gvxTraceLocusAttribution` refuse une hypothèse si ses événements n’existent pas,
ne portent aucun signal d’échec, ne ciblent pas le même composant que le locus ou
si le reçu indépendant ne lie pas exactement la trace, l’hypothèse et le locus.
Les refus restent dans le rapport et dans le ledger du cycle.

`gvxAffinityMutationPlanner` réutilise le diagnostic de maturation AEIS. Le nom de
mutation ne donne aucune autorité : le locus doit fournir la recette correspondante,
ses valeurs admissibles, une taille maximale et `maxEdits: 1`. Un diagnostic
`no_error` ne produit pas de candidat.

`gvxTraceGuidedRepair` exige des ensembles entraînement/holdout non vides,
dédupliqués et disjoints. Seul le hash du holdout entre dans les contrôles et le
ledger; les références sont transmises à l’évaluateur après construction du
candidat. L’adaptateur de branche doit retourner un identifiant unique et
`production: false`.

Les bras produisent des attestations d’isolation et des artefacts de métriques. La
nursery recalcule les hashes et appelle les vérificateurs enregistrés. Le comparateur
n’utilise ensuite que ces métriques vérifiées. Toute amélioration reste une
éligibilité à revue externe avec `promotionAllowed: false`.

## Limites

- Le protocole teste une hypothèse fournie; il ne prouve pas qu’elle est l’unique
  cause réelle.
- La séparation des identités et workspaces est vérifiable, mais ne garantit pas
  l’indépendance des méthodes ou données.
- Les adaptateurs hôte doivent assurer le confinement OS des branches.
- La qualification métier demande une campagne réelle, des holdouts protégés et
  des fenêtres longitudinales avant toute application somatique.

Voir [ADR 0652](../adr/0652-reparation-guidee-par-traces-gvx.md), la
[nursery expérimentale](nursery-experimentale-gvx.md) et le
[monitoring longitudinal](monitoring-longitudinal-gvx.md).
