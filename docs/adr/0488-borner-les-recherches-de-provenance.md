# ADR 0488 — Borner les recherches de provenance MCP

- **Statut** : Accepté et implémenté.
- **Date** : 2026-10-14
- **Domaine** : `genos_blame`, `genos_lineage` et extraction d'évidence.
- **Décideurs** : Mainteneur GenOS.
- **Lié à** : ADR 0480, preuve de rejeu liée au run ; ADR 0485, cohérence des métriques.

## Contexte

`genos_lineage` utilisait une CTE récursive `UNION ALL` sans borne. Un cycle ou
un graphe fortement connecté pouvait produire des répétitions et consommer du
CPU et de la mémoire sans limite applicative. `genos_blame` avait une limite
fixe de 1 000 résultats, mais ne signalait pas qu'une réponse pouvait être
tronquée.

## Décision

Les deux recherches récupèrent au plus 1 001 lignes, exposent au plus 1 000
éléments et posent `truncated: true` lorsque la ligne sentinelle est présente.
La CTE récursive de lineage applique elle-même cette borne. Une réponse tronquée
ou vide reste en échec avec `provenance.complete: false`; elle ne peut pas être
interprétée comme une chaîne complète.

## Conséquences

### Positives

- Un cycle ne peut plus entraîner une exploration récursive non bornée.
- La mémoire et le travail de sérialisation de réponse restent limités.
- Les consommateurs peuvent distinguer une chaîne complète d'une réponse tronquée.

### Négatives

- Une provenance dépassant 1 000 éléments demande une pagination ou une requête
  ciblée, fonctionnalité non fournie par ces outils.

## Alternatives

- Conserver `UNION ALL` sans limite : rejeté, car les cycles ne sont pas
  impossibles au niveau du stockage.
- Couper silencieusement à 1 000 : rejeté, car une sortie partielle pourrait
  être consommée comme une filiation complète.

## Vérification

`node backend/tests/test_conclusion_provenance_integrity.js` crée un cycle de
lineage, vérifie la borne de 1 000 résultats et exige le signalement de la
troncature. La suite complète passe avec 30 assertions.
