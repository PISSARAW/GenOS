# ADR 0027 — Adaptateurs bornés pour conscience et métaphysique

- **Statut** : Accepté
- **Date** : 2026-09-19
- **Domaine** : registre philosophique, ontologie, conscience
- **Lié à** : [taxonomie esprit-mental](../01-concepts/conscience-esprit-mental.md), [registre philosophique](../03-reference/registre-philosophique.md)

## Contexte

Les entrées de qualia, intentionnalité, supervenience, émergence et relation
esprit-corps avaient des mappings partiels ou non routés. Des implémentations
existantes confondaient parfois une donnée rapportée avec une expérience, une
absence échantillonnée avec une émergence forte, ou une seule comparaison avec
une loi de supervenience.

## Décision

`implemented` décrit désormais l'adaptateur GenOS testable, pas la vérité de la
thèse philosophique.

- Les qualia sont représentés comme rapports structurés, avec provenance
  déclarée et accès phénoménal non évalué.
- L'intentionnalité représente un acte et sa cible déclarée.
- La supervenience compare des états JSON canoniques et rapporte les
  contre-exemples observés ; une seule paire est insuffisante, et aucune
  conclusion métaphysique n'est promue.
- L'émergence examine une propriété système et un échantillon non vide de
  constituants. Une absence dans cet échantillon produit seulement une
  candidate d'émergence faible, jamais une preuve d'émergence forte.
- Le lien esprit-corps compare des modèles descriptifs, dont le modèle
  cartésien ; aucun couplage causal n'est appliqué au runtime.

Les adaptateurs sont routés par `philosophyRouter.evaluateConcept`, exposent une
limite dans leur résultat et restent non promouvables.

## Conséquences

- Les maturités de ces concepts passent à `implemented` avec des notes propres à
  chaque concept ; la maturité globale d'un service partagé peut rester `partial`.
- Les empreintes d'états sont SHA-256 et indépendantes de l'ordre des clés ; les
  valeurs non JSON et les cycles sont refusés.
- La documentation continue d'interdire toute inférence de conscience,
  d'expérience subjective ou de dualisme réel à partir de ces structures.
