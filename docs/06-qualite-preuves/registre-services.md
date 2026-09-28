# Registre complet des services

Statut : squelette d'étape 1, réconcilié 2026-09-28 (baseline `1ebb3589`, HEAD `2321a946`). Source de vérité : `node scripts/ci/audit_service_reachability.js --json`.
Règle : un succès de transport n'est pas une décision valide ; le passage à `actif` exige un parcours `Sense → Reuse` prouvé dans la [matrice de câblage](wiring-matrix.md).

## 1. Surfaces

| Surface | Périmètre | Entrées de production | Compte au 2026-09-28 |
|---|---|---|---|
| Node | `backend/src/services/**/*.js|.cjs|.mjs` | `backend/server.js`, `mcp/index.js`, `backend/bin/*` | **1 819** services : 1 313 atteignables en import littéral, 506 à revoir, dont 309 sans import littéral (`literalInbound === 0`) |
| Rust | `crates/*` + `packages/*` du workspace | `genos-cli`, `genos-api` (gRPC/REST), pont `rustBridgeController` | 16 crates + 2 packages : `common, store, signal, genome, dna, cell, biology, immune, reproduction, orchestrator, worker, api, cli, mcp, simple-cli, sensorimotor` + `sqlite-udfs, storage-gate` |
| MCP | `shared/toolDefinitions.json` vs `mcp/toolDefinitions.json`, `mcp/*.js` | `node mcp/index.js` (stdio), leases `GENOS_MCP_LEASE`, `GENOS_MCP_DISABLED_TOOLS` | 36 définitions partagées par catalogue (`shared/toolDefinitions.json`, `mcp/toolDefinitions.json`), 176 outils déclarés côté backend (`MCP_TOOLS_LIST`) ; le nombre exposé via `tools/list` varie selon la lease active et la configuration (aucun sans lease, fail-closed) |
| Intégrations | `integrations/ide`, `examples/`, `scripts/`, `backend/bin` | CLI opérateur, orchestrateur `genos-orchestrate`, démos | 1 contrat IDE (`genos-extension-contract.json`), ~50 programmes `backend/bin`, démos `examples/` |

## 2. Fiche type (une par service)

Chaque fiche porte : propriétaire (dossier/famille), entrée de production (route, job, CLI, daemon, outil MCP), contrat (fonction + schéma), consommateurs (appelants vérifiés, pas supposés), statut voulu (`actif`, `expérimental`, `bibliothèque`, `obsolète`, `à classer`), preuve (test + reçu/persistance).

Statuts :
- `actif` : parcours de production prouvé, relié à la matrice.
- `expérimental` : branché mais sans gate passé ; ne gouverne aucune décision.
- `bibliothèque` : utilitaire volontairement passif (helpers, stratégies, définitions) ; à marquer, pas à câbler artificiellement.
- `obsolète` : remplaçable/supprimable ; preuve d'absence d'appel avant retrait.
- `à classer` : défaut tant que l'enquête n'est pas close. Les 506/309 restent `à classer`, pas `inutiles`.

## 3. Premier tri des 309 sans import littéral

Méthode : `literalInbound === 0` depuis `backend/src + backend/bin + mcp/index.js`. Heuristique complémentaire par mention nominale du basename (piste, pas verdict) :
relevé 2026-09-27 sur base 308 — **75** avec mention en production (registre, chargement dynamique ou définitions философия/paramètres probables), **125** visibles seulement en tests, **108** orphelins stricts (ni prod ni test par nom) ; à relancer sur base 309 (le script cité est un chemin temporaire local, non rejouable tel quel).

Top familles sans inbound (2026-09-28, reproductible) : `(racine) 114`, `morphogenesis 71`, `holobionte 20`, `daemon 11`, `epistemic 9`.
Top familles non atteignables (2026-09-28, reproductible) : `morphogenesis 138`, `(racine) 136`, `holobionte 42`, `mathematical 34`, `communication 22`.

Lots proposés (ordre du plan) : morphogenèse, racine, holobionte, mathematical, communication. Chaque lot : entrée → sélection → appel → effet décision → action → observation → persistance → réutilisation, avec test de parcours + cas de refus + reçu vérifié.

## 4. Ponts de frontières (étape 5 anticipée)

- Node↔Rust : seul `createSnapshot` exige sortie nulle + schéma valide + reçu `genos.rust-bridge-snapshot/v1` ; autres ponts sans reçus systématiques (cf. matrice §11).
- backend↔MCP : registre + lease + schéma avant `preValidateTool`/docking ; l'écart entre les 36 définitions partagées et les 176 outils déclarés backend tient aux surfaces (schémas publics vs registre de dispatch runtime : outils CLI, biologiques et primitives de stratégie) et reste à justifier outil par outil.
- Intégrations externes : contrat IDE `genos.ide/v1`, providers, budgets ; aucun succès transport compté sans gate.

## 5. Critère de sortie de l'étape 1

Registre squelette posé ici ; reste à : attribuer un statut explicite aux 309 (séparer bibliothèques et inactifs volontaires des raccordements manquants), produire l'inventaire équivalent Rust/MCP/intégrations avec ponts typés, puis faire produire au CI registre + écarts + preuves (étape 6).
