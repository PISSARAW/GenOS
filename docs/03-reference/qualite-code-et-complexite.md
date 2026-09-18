# Qualité du code et complexité

- **Statut** : Implémenté
- **Portée** : gate de qualité du dépôt
- **Dernière revue** : 2026-09-18

## Contrat

La gate `scripts/ci/check_code_quality.py` contrôle les fichiers source suivis par
le dépôt avec trois seuils : 400 lignes par fichier, 3 paramètres par fonction et
une complexité cyclomatique maximale de 10.

Le mode strict est indépendant de la dette historique :

```bash
python scripts/ci/check_code_quality.py --strict
python scripts/ci/check_code_quality.py --strict --report-json .tmp/quality-report.json
```

Le rapport strict contient les seuils, le nombre total d’écarts, le détail par règle
et la liste des violations. Il sert à mesurer la dette complète ; la baseline ne
sert qu’à empêcher l’introduction de nouveaux écarts pendant la migration.

## Périmètre

Les extensions contrôlées sont `.js`, `.cjs`, `.mjs`, `.py`, `.rs`, `.ts` et `.tsx`.
Les répertoires `vendor`, `node_modules`, `target`, `build`, `dist`, `.git` et les
répertoires générés GenOS sont exclus. Le code vendor n’est donc pas assimilé à une
dette refactorable du produit.

## Procédure de correction

Chaque lot doit réduire au moins une violation, conserver les tests ciblés et être
committé séparément. Les refactors de complexité doivent extraire des responsabilités
réelles ; il est interdit de déplacer mécaniquement les branches ou de contourner la
gate avec des annotations.
