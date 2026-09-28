# Phase 1.2 — Inventaires Rust, MCP et integrations

Generateurs (auteur concurrent, reutilises sans duplication) :

- `node scripts/ci/inventory_rust.js` → **20 crates**, 35 commandes CLI
  (0 non declarees), **22 noms d'outils MCP Rust**, 13 crates mentionnees
  cote Node.
- `node scripts/ci/inventory_mcp.js` → catalogues **36/36** (0 sans schema),
  22 outils Rust, bail absent = fail-closed, 8 tests Node.
- `node scripts/ci/inventory_api.js` → **44 routes** (0 orphelines,
  1 sans mention de test), **41 protos** (0 sans impl, 0 sans mention test).
- `node scripts/ci/inventory_integrations.js` → contrat IDE present,
  2 exemples, 6 modules providers, 12 fichiers navigateur/foraging,
  binaires externes (docker, gh, git, powershell, python).

## Ecarts intentionnels documentes

- Catalogues publics **36** vs outils runtime backend **176** :
  l'ecart est nominal au niveau noms publics (0 `onlyShared`/`onlyBundled`),
  les 176 incluent services internes, genome, strategies et bio-outils
  non exposables sans handler + lease (Phase 2.2).
- Rust MCP **22 noms** vs catalogues **36** : parite partielle, limites
  a documenter (Phase 2.2), sans exposition automatique.
- Ponts Node→Rust : 13 crates mentionnees (piste textuelle, pas verdict
  de cablage). `spawn` seul ne prouve ni invocation ni effet.

## Statuts initiaux

- Crates runtime (cell, biology, orchestrator, store, mcp, cli) :
  `experimental` minimum (branches-runtime avérés) ; `actif` reserve
  aux parcours Phase 3 + recu.
- Bibliotheques passives : hors obligation d'etre cablees ; suppression
  interdite sans preuve d'absence d'usage.
- Routes orphelines : 0. La route sans mention de test et le RPC
  `StartMission` sans cas sont les premiers `a_classer` de Phase 2.3.
- Tout le reste non examine : `a_classer` avec responsable + raison.

## Lien Sense → Reuse

Matrice `wiring-matrix.md` : `YES` = appel prod + test, `PARTIAL` =
present non causal, `NO` = absent. Les nombreux `Learn`/`Reuse` manquants
sont l'objet de la Phase 6, uniquement sur preuves validees.
Ce point fige les generateurs et les comptes ; le classement exhaustif
reste le chantier Phase 1 (un statut justifie par entree, ou `a_classer`).
