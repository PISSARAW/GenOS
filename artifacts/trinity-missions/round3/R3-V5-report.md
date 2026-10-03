# R3-V5 — Factorial, matrice 2×2×2 (décomposition × recherche × objectif)

**Verdict : ÉCHEC** — évasion (W1), revendications sans cellules (W2), cellules nommées sans ANOVA ni interactions (W3). Aucune statistique factorielle exécutée.

## Variant et workers

- Variant `factorial` (orch `6df1ae69`, 19:01:31 → compared 19:01:46). À noter : W1 mentionne « mission contract » — les contrats de mission (commit 6d7d0293) sont live dans les prompts.

## Mondes

- **W1** : évasion (pas d'accès fichiers/Internet pour une « grille factorielle d'expériences »).
- **W2** : « les 8 cellules ont été évaluées » — aucune cellule montrée. Revendication pure.
- **W3** : cite deux cellules (globale×exacte×temps = meilleure latence ; hiérarchique×heuristique×robustesse = impossible) + `# Factorial_grid world topology`. Pas d'effets principaux, pas d'interactions, pas de conclusion « impossible en comparaison simple ».

## Mécanisme sous pression

Le service `trinityFactorialGrid` (ANOVA, effets, interactions) est testé unitairement mais **jamais alimenté par les mondes** : aucune grille, aucune cellule mesurée. Le variant produit du vocabulaire factoriel, pas des facteurs. ESCALATE correct.

## Replay / télémétrie / budget

- `launch_round3.cjs V5` ; `status_round3.cjs V5`. ~60 s, 3 runs, 0 $.
