# ADR 0344 — Refactorings de qualité et frontières de contrôle

- **Statut** : accepté.
- **Date** : 2026-10-07.

## Contexte

Le contrôle P0 du 6 octobre observait 153 nouvelles violations dans 97 fichiers,
avec une baseline inchangée. Des fonctions de validation, de compilation et de
contrôle mélangeaient préparation, dispatch et traitement des résultats.

## Décision

Extraire les responsabilités dans des fonctions bornées et des modules dédiés.
Regrouper les paramètres de contexte et mettre à jour leurs points d’appel.
Séparer les handlers Omega, les validations et le placement Holobionte ainsi que
les opérations CLI Rust, en conservant les contrats de preuve et les refus.

Préserver la frontière de reprise transactionnelle : une précondition explicite
périmée est refusée immédiatement ; seul un conflit lors du commit est réessayé.
Le test de persistance Syncytium utilise un worker déclaré et son contexte
associé à la session, sans supprimer le contrôle d’identité.

Ne pas modifier les seuils ni la baseline et ne pas utiliser de contournement
inline. Conserver les modifications étrangères hors du commit de qualité.

## Conséquences

Le contrôle global du 7 octobre examine 5 311 sources : 133 violations historiques
et aucune nouvelle. Les suites Omega et qualité, les tests de réservation et de
persistance ciblés passent. Les sept tests de la bibliothèque CLI Rust passent.

La validation intégrale reste ouverte. La dernière exécution du workspace Rust
échoue au lien faute de disque. Le nouveau test MCP Rust observe 20 réussites et
un échec de confinement du chemin relatif dans le workspace de test. La relance
npm rencontre une connexion locale refusée par le sandbox, après des erreurs
de stockage lors de la saturation du disque. Ces résultats ne prouvent pas une
validation complète, ni une clôture scientifique de P0.

## Alternatives

Augmenter la baseline ou les seuils masquerait la dette nouvelle et est rejeté.
Un commit global de tout le workspace mélangerait les travaux préexistants.
