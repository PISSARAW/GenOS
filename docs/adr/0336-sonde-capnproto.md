# ADR 0336 - Sonde Cap'n Proto sans migration implicite

- **Statut** : Accepté
- **Date** : 2026-10-06
- **Domaine** : transport interne, sérialisation

## Décision

Ajouter une sonde isolée de roundtrip Cap'n Proto et de mesure exploratoire
contre MessagePack. Le test emploie une charge binaire commune, pas un schéma
typé final. Aucun transport de production n'est remplacé sur ce signal seul.

## Limites

La sonde n'établit ni un gain de latence global ni une compatibilité de
bindings multi-langages. Un futur choix exige des charges GenOS réelles et
une comparaison des allocations, tailles et coûts de maintenance.
