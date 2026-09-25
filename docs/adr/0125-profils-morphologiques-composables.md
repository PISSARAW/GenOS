# 0125 — Profils morphologiques composables

- **Statut** : Accepté
- **Date** : 2026-09-25
- **Domaine** : Morphogenèse, catalogue de variants, graphes d'exécution
- **Lié à** : [ADR 0110](0110-catalogue-central-des-variants-morphologiques.md), [ADR 0124](0124-selection-automatique-des-variants.md)

## Contexte

Le catalogue de variants présente un choix unique par topologie, alors que plusieurs
dimensions morphologiques peuvent coexister. Une sélection unique confond structure,
communication, ressources, preuves et politiques de cycle de vie. À l'inverse, déclarer
une combinaison active sans validation ni trace dans le plan ferait croire à des capacités
non exécutées.

## Décision

Introduire un `TopologyProfile` versionné qui nomme sa topologie de base et peut référencer
des variants dans des dimensions orthogonales. Le registre résout chaque référence contre
le catalogue réel, rejette les références inconnues, limite la structure à un seul variant,
et exige une autorisation explicite pour inclure une entrée partielle. Les paramètres
composés doivent être compatibles; une collision de valeurs est une erreur.

Le plan Morphogenèse et le nœud racine du graphe conservent le profil résolu, le variant
structurel historique et les paramètres effectifs. Les appels historiques avec `variantId`
se traduisent en profil structurel. Cette représentation est descriptive et traçable : un
adaptateur doit appliquer et mesurer chaque politique avant que sa présence puisse être
présentée comme un comportement exécuté.

## Conséquences

- Les profils composent les références sans multiplier les enums de variants.
- Les catalogues locaux restent la source de vérité des identifiants et de la maturité.
- Les collisions et les variants partiels sont visibles avant l'exécution.
- L'application comportementale reste la responsabilité des adaptateurs de topologie.

## Alternatives

- Garder un variant unique : ne permet pas de représenter des politiques orthogonales.
- Copier les paramètres des variants dans le profil : perd la provenance et la validation
  du registre.
