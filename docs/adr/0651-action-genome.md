# ADR 0651 — ActionGenome comme contrat canonique d’action

## Statut

Accepté.

- **Date** : 2026-10-19
- **Domaine** : contrat d’action, admission, reçu causal, REST, CLI, MCP
- **Décideurs** : mainteneurs GenOS
- **Lié à** : [ADR 0651b — Admission MHC et capacités au point d’effet](0651-admission-mhc-et-capacites-au-point-effet.md), [API et contrats](../03-reference/api-et-contrats.md)

## Contexte

Les surfaces REST, CLI et MCP décrivent aujourd’hui leurs actions avec des contrats distincts. Une réussite de transport ne prouve ni l’autorité de l’acteur, ni la validité de l’état lu, ni l’obtention des preuves attendues. Dériver une nouvelle surface directement d’un schéma d’entrée masquerait aussi les effets, budgets et conditions de compensation.

## Décision

GenOS introduit `genos.action-genome/v1`, un contrat déclaratif et fermé qui réunit :

- identité et version de l’action ;
- schémas d’entrée et de sortie ;
- préconditions et postconditions sans code exécutable ;
- chemins d’état lus et écrits, et effets déclarés ;
- permissions et leases nécessaires ;
- budget temporel et coût maximal ;
- réversibilité, rayon d’impact et éventuelle action compensatrice ;
- preuves attendues.

La validation rejette les champs d’autorité inconnus et toute section obligatoire absente (`backend/src/services/actionGenome/actionGenomeValidator.js`, schéma canonique `shared/actionGenome.v1.schema.json`). Le contrat ne confère aucune autorité et n’exécute aucune action.

Les projections de surface sont déclarées dans `shared/actionSurfaceBindings.v1.json` : la liaison MCP (`genos_topology_session`, `operation: events`) et la liaison REST sont décrites ; la surface REST est câblée en mode `admission_only` via `POST /api/action-genomes/:id/:version/evaluate` (permission `mcp:execute_safe`, refus exprimé par 409). La projection CLI reste descriptive. Une projection n’est annoncée comme câblée que si une liaison vérifiable vers une surface existante est fournie.

Une invocation évaluée produit un reçu causal distinct (`actionInvocation.js`, `causalReceipt.js`). Ce reçu lie l’acteur, la version d’état observée, le contrat exact et le verdict d’admission. Il ne constitue jamais une preuve d’effet ni un rollback. Le premier génome publié est `shared/actionGenomes/syncytium.session.events.v1.json`.

## Conséquences

- Les surfaces peuvent partager un vocabulaire sans partager implicitement leurs permissions.
- Les intégrations incomplètes restent visibles comme descriptives.
- Les actions existantes peuvent migrer progressivement vers ce contrat.
- Les restaurations Syncytium et A2A restent hors périmètre tant qu’elles ne sont pas implémentées et vérifiées.

## Preuves exécutables

- `backend/tests/test_action_genome_contract.js` vérifie le contrat canonique et
  le rejet des champs inconnus ;
- `backend/tests/test_action_genome_invocation.js` vérifie l’admission causale
  (préconditions, postconditions, permissions, leases, budget) et le reçu causal ;
- `backend/tests/test_action_genome_projections.js` vérifie les liaisons de
  surface déclarées et la visibilité des intégrations non câblées ;
- `backend/tests/test_action_genome_rest.js` vérifie les routes REST
  d’admission et le refus 409.
