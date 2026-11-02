# Raccorder GNS aux besoins morphogénétiques

## Décision

Le pipeline morphogénétique V2 relit GNS pendant son étape d'observation,
uniquement lorsque `GENOS_NERVOUS_ENABLED=1`. Le scope provient du workspace
enregistré de l'agent orchestrateur. Les membres viennent de `mission_agents`
après validation du lien mission/orchestrateur dans `missions`. Sans mission
correspondante, seul l'orchestrateur est retenu ; sur les anciennes bases sans
ces tables, le sous-arbre d'agents persisté sert de repli. Le scope est filtré
et la sélection est bornée à 128 membres. Ces membres peuvent produire
deux besoins consultatifs : `REEVALUATE_TOPOLOGY` sur alerte fraîche et
`REALLOCATE_WORKERS` sur pression fraîche d'au moins 0,8.

Chaque besoin cite son signal et son événement source, porte
`evidenceStatus: UNVERIFIED` et `executionAuthorized: false`. Le diagnostic et
la synthèse shadow existants transmettent ces besoins dans leur proposition.
Les services V2 de production reçoivent cette observation dans leurs étapes
`diagnose` et `generateNeeds`, puis appliquent leurs propres politiques.

Ces besoins ne fabriquent ni gain causal, ni topologie recommandée, ni budget.
Leur nombre est borné à 64. Les gates de typage, de contraintes, de Pareto,
du noyau Rust, de gouvernance et de transition demeurent obligatoires. Aucun
appel automatique à un handler de réallocation n'est ajouté par ce pont.

L'absence d'identité, de scope ou de données fraîches conserve le comportement
antérieur. Le raccordement ne constitue pas une preuve d'amélioration.

## Vérification

`backend/tests/nervous/gnsMorphogenesis.test.js` fait passer des signaux SQLite
dans le pipeline V2 réel, jusqu'à la synthèse et au refus du hard gate ou de
l'autorité, et vérifie désactivation, expiration et isolation.
