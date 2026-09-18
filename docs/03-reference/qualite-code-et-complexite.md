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

La mesure distingue les décisions (`if`, boucles, `case`, `catch`, conditions
ternaires et opérateurs booléens) des opérateurs de sûreté JavaScript (`?.`, `??`).
Ces derniers ne créent pas de branche métier supplémentaire et ne sont pas comptés.

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

## Première migration

Le routeur d’ontologie délègue désormais ses opérations via une table de handlers
spécialisés. Cette séparation réduit la complexité du dispatch sans changer le contrat
des opérations MCP/CLI ; les validations propres aux opérations restent dans leurs
handlers respectifs.

Les validations de manifestes du registre utilisent également une table de stratégies
par type d’artefact. Ajouter un nouveau type ne nécessite plus d’allonger une chaîne
conditionnelle centrale.
