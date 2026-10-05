# ADR 0320 — Compilation procédurale runtime

- Statut : Accepté
- Date : 2026-10-05
- Domaine : Procéduralisation, mémoire, coût d'inférence, preuve
- Décideurs : Équipe GenOS

## Contexte

Les trajectoires AGOW et la consolidation de chemins existaient, mais aucune
boucle générique ne persistait une procédure validée ni ne la réutilisait avant
une nouvelle délibération modèle.

## Décision

`proceduralCompilationService` enregistre les traces, détecte les sous-chemins
communs, construit une procédure candidate et exige un rejeu fourni par l'hôte
avant promotion. Les candidats et receipts sont persistés en SQLite. La
réutilisation résout uniquement un exécuteur déterministe enregistré et ne
déclenche aucun appel LLM.

## Invariants

1. Une trace réussie doit porter au moins une référence de preuve.
2. Une séquence ne devient active qu'après validation/rejeu explicite.
3. Une procédure active est liée à son agent et à son contexte.
4. Un exécuteur absent bloque la réutilisation; aucun fallback LLM implicite n'est permis.
5. La réutilisation expose `llmCalls: 0` et `costUsd: 0`.
6. Les anciennes versions sont conservées comme `superseded` et non écrasées.

## Conséquences

Les tâches répétitives peuvent suivre un chemin déterministe à coût d'inférence
nul, tandis que les échecs de validation restent visibles et forcent la
délibération. L'exécuteur et le validateur restent des capacités de l'hôte,
jamais des fonctions sérialisées dans la base.
