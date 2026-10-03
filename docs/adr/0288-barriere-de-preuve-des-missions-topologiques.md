# ADR 0288 — Barrière de preuve des missions topologiques

## Statut

Acceptée.

## Date

2026-10-03.

## Domaine

Benchmarks topologiques, dossiers workers, vérification indépendante.

## Décideurs

Équipe GenOS.

## Lié à

ADR 0277, 0278, 0281, 0283 et 0287.

## Contexte

Le runner des campagnes marquait une topologie vérifiée à partir de workers terminés
et d'un reçu de dispatch. Le manifeste déclarait pourtant l'oracle missionnel
manquant. Les probes de composant ne garantissaient ni la présence d'un dossier
worker substantiel ni la justesse de la réponse demandée.

## Décision

Une mission topologique ne passe que si tous ses workers ont un rapport substantiel
persisté et si un oracle indépendant propre à la mission est présent et réussi.
`status: missing`, l'acceptation du dispatch, un probe de composant ou le seul état
`completed` ne satisfont pas cette barrière. Le résultat conserve séparément le
compte des dossiers et l'état de l'oracle afin d'expliquer un blocage.

## Conséquences

### Positives

- Les workers `idle`, en erreur ou sans rapport ne peuvent plus soutenir une
  vérification réussie.
- L'absence d'oracle devient un blocage explicite, jamais une preuve implicite.
- Les contrôles techniques restent distincts de la réussite de la mission.

### Négatives

- Les missions topologiques dont le manifeste indique encore un oracle manquant
  restent non vérifiées jusqu'à l'ajout d'un oracle indépendant adapté.

## Alternatives

- Traiter le dispatch accepté comme preuve d'exécution : rejeté, car plusieurs
  campagnes ont laissé les workers inactifs ou en erreur.
- Utiliser le même modèle comme oracle : rejeté, car cela ne vérifie pas
  indépendamment ses affirmations.
