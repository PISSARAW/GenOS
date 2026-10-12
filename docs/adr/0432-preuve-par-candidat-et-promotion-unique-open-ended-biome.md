# ADR 0432 — Preuve par candidat et promotion unique dans Open-Ended Biome

## Statut

Accepté le 11 octobre 2026.

## Contexte

Le contrôleur Open-Ended admettait un candidat sans `evidenceRefs` propres
quand le cycle possédait des références globales. Il pouvait aussi compter
plusieurs fois une niche déjà connue comme promotion. La série de tours sans
nouvelle niche ne reflétait alors plus les résultats du variant.

## Décision

- Un candidat doit porter ses propres `evidenceRefs` non vides pour être
  admissible. Les références globales du cycle ne remplacent pas cette liaison.
- Une réévaluation doit apporter ses propres références ; elle n'hérite pas
  des preuves conservées avec un environnement archivé.
- Le contrôleur relève les identifiants des niches avant le tour. Seuls les
  nouveaux identifiants créés depuis les candidats admissibles comptent dans
  `promoted`, une seule fois par tour.
- Les candidats répétés restent visibles comme candidats examinés, mais ne
  réinitialisent pas la série des tours stériles.

## Limite

Les références et mesures de valeur restent fournies par l'hôte ; ce contrôle
vérifie leur liaison au candidat, pas leur validité scientifique externe.
L'ouverture d'une niche ne démontre pas l'exécution d'une population ni la
réussite de l'objectif global du Biome.
