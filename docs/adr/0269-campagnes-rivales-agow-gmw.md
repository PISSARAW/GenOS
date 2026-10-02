# ADR 0269 — Protocoles Rivals pour AGOW et signature GMW

- **Statut** : Accepté
- **Date** : 2026-10-02
- **Domaine** : AGOW, expérimentation, médiation, preuves
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0019, 0024, 0049, 0051

## Contexte

AGOW dispose déjà d'expériences d'ablation, de reçus de diffusion et d'une nursery
GVX vérifiée. Comparer chaque architecture rivale avec un framework indépendant
dupliquerait les contrôles et affaiblirait la provenance des résultats. Les reçus
de médiation actuels constatent une transformation de receveur, mais leurs hashes
seuls ne mesurent pas la réponse entrée-sortie d'une intervention.

## Décision

Ajouter un registre et un exécuteur uniques de campagnes rivales. Une campagne
déclare son baseline, son traitement, ses locks modèle/outils, son budget, ses seeds,
ses métriques, ses ablations, sa topologie et ses vérificateurs. Chaque variante
tourne dans un monde isolé à travers la nursery GVX. L'adaptateur doit retourner le
manifeste de locks appliqués; un mismatch arrête la campagne.

Pour GMW, conserver des vecteurs d'intervention bornés sur les reçus de médiation et
calculer une signature descriptive de reachability, observability, réponse,
alignement, dimensionnalité et couverture source-cible. La signature nomme sa
méthode proxy, cite ses reçus et ne peut pas promouvoir un claim. La validation
causale et la réplication restent des gates séparées.

## Conséquences

### Positives

- Les comparaisons utilisent les mêmes locks, budgets, seeds et preuve nursery.
- Les topologies de contrôle peuvent montrer que l'état partagé ou le broadcast ne
  suffit pas à établir une médiation.
- Les vecteurs sont dimensionnés et filtrés; les métriques ne sont marquées
  vérifiées que si des artefacts dédiés passent leurs vérificateurs.

### Limites

- La signature `intervention_vector_proxy_v1` est une estimation descriptive, pas
  une reproduction du protocole mathématique GMW ni une preuve de supériorité.
- Il faut encore fournir les adaptateurs d'environnement, les artefacts mesurés et
  les campagnes holdout avant toute revendication comparative.

## Alternatives

- Créer un framework par rival : rejeté, car cela dupliquerait les contrôles et la
  persistance expérimentale.
- Calculer la médiation depuis les seuls hashes d'état : rejeté, car ils ne
  contiennent ni entrée ni réponse mesurée.
- Qualifier les indicateurs depuis des tests unitaires : rejeté, car un test de
  code ne prouve ni effet causal ni généralisation.
