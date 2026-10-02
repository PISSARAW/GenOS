# ADR 0275 — Gates Butlin et suite fonctionnelle unifiée

- **Statut** : Accepté
- **Date** : 2026-10-02
- **Domaine** : Épistémologie, benchmarks, promotion, AGOW
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0269, ADR 0271, ADR 0274

## Contexte

Le passage d'une implémentation à une preuve généralisée ne doit pas être déduit de
tests unitaires ou d'un inventaire de fonctionnalités. Les six familles de challenge
doivent pouvoir être exécutées sous des locks et seeds communs afin que leur résultat
ne soit pas une collection de forks spécialisés.

## Décision

Les indicateurs progressent de `specified` à `operational` selon une chaîne stricte :
spécification, implémentation vérifiée, ablation causale locale, campagne externe,
puis réplication réservée. Le collecteur ne considère que les artefacts vérifiés par
le registre GVX; l'intégrité de hash et les classes de tests ne suffisent pas.

La suite unifiée exige les défis Araya, CTM, MBH, Lipson, GMW et J-space, avec locks
modèle/outils/budget et seeds identiques. Elle envoie tous les résultats vers la
nursery et conserve la promotion désactivée.

## Conséquences

### Positives

- Les rapports indiquent les reçus manquants et l'étape suivante sans convertir un test
  en résultat scientifique.
- Un runner peut vérifier la comparabilité des six challenges avant toute exécution.

### Limites

- L'absence de receipts externes laisse l'indicateur `not_assessed`; aucun claim n'est
  promu par défaut.
- Les locks communs n'assurent pas à eux seuls l'équivalence des environnements, des
  datasets, ni des encodeurs perceptifs.

## Alternatives

- Déduire un niveau depuis la présence de code ou de tests : rejeté, car cela confond
  implémentation et validation empirique.
- Autoriser des seeds différents par rival : rejeté, car cela brouillerait les
  comparaisons de la suite unifiée.
