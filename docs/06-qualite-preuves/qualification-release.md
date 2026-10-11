# Qualification de release GenOS

- **Statut** : non qualifiée au 2026-10-11.
- **Portée** : portes automatiques locales et inventaire des workers. Les services externes, les déploiements et les missions libres exigent des campagnes distinctes.

## Rapport reproductible

Depuis un checkout propre avec ses propres dépendances installées, lancer :

```powershell
node scripts/ci/run_release_qualification.cjs 'D:\genos-release-qualification'
```

Le répertoire de sortie doit être absolu et hors du dépôt. `report.json` lie le
commit, l'état Git avant et après, les versions disponibles, le digest des cas
workers, les commandes, leurs codes de sortie et les empreintes des journaux.
Chaque porte écrit son journal séparé. Le contrôleur exécute dans l'ordre la
qualité du code, `npm test`, la suite MCP, la validation backend puis
`cargo test --workspace`. Il continue après un échec pour conserver tous les
résultats. Un checkout modifié ne lance aucune porte et donne un verdict rouge.

Les trois répertoires `node_modules` doivent être installés dans le checkout
évalué. Un lien vers les dépendances d'un autre checkout est signalé et
empêche la qualification. Les sorties sont conservées hors du dépôt pour ne
pas modifier le commit examiné.

`automated_scope_qualified` exige les cinq portes vertes, un checkout resté
propre, des dépendances isolées, un oracle pour chaque cas du benchmark et un
cas lié à chaque méthode enregistrée. Tout autre état donne `not_qualified`
et un code de sortie 1. Ce statut ne certifie pas les intégrations externes,
la sûreté de production ni la robustesse statistique.

## Écarts actuels et ordre de fermeture

1. **Preuve workers** : neuf cas n'ont pas d'oracle et treize méthodes n'ont
   pas de cas de benchmark lié. Étendre les fixtures et les oracles distincts,
   puis exécuter des missions persistées C2 et C3 pour chaque méthode.
   Les 375 contrats de concepts passent 13 500 sondes bornées dans la
   validation backend ; le compteur de validation en mission réelle reste à
   zéro et doit être traité séparément.
2. **Reproductibilité** : répéter les portes et les campagnes sur Windows et
   Linux, avec dépendances propres, sous contention, redémarrage et reprise.
   Conserver chaque essai et tout échec intermittent.
3. **Observabilité** : expliquer les erreurs SQLite affichées pendant des
   suites vertes et éliminer les erreurs de télémétrie et de fermeture qui
   masquent une perte de signal.
4. **Exploitation** : qualifier les baux MCP, la reprise, le confinement des
   chemins, les budgets, Studio et les intégrations dans des parcours opérateur
   complets. Chaque parcours doit avoir une preuve métier, pas seulement un
   transport ou une route déclarée.

La [qualification des workers](qualification-workers.md) détaille les niveaux
C0 à C4, les neuf cas sans oracle et les limites des missions déjà exécutées.
Le [rapport MCP](../../scripts/ci/report_mcp_qualification.js) distingue le
catalogue, le routage et les résultats métier non encore évalués.
