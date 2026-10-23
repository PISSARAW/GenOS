# Qualification locale du rappel mémoire situationnel — 2026-10-23

- **Statut** : Qualification logicielle ciblée réussie ; validation globale limitée par des contrôles hors lot ; efficacité sur missions réelles non mesurée.
- **Portée** : contexte mémoire historique des prompts Node.js, sans nouveau contrat de recherche REST/gRPC/MCP ou Rust.
- **Environnement observé** : Windows, Node.js `v24.18.0`, Cargo `1.97.1`.
- **Révision de base** : `3ec15efb9a5e21d2e1f3bc9d939ebc2391f36eb8`, avec changements locaux préexistants et lot non commité.
- **Décision** : [ADR 0733](../adr/0733-rappel-memoire-situationnel-inspire-tsao.md).

## Comportement qualifié

Le rappel compare les caractéristiques structurelles des souvenirs déjà accessibles,
sélectionne des candidats puis les reclasse selon exploration, diagnostic ou
vérification. Les filtres de portée restent en amont ; les références originales,
les précautions et le budget historique restent présents. Les traces de classement
sont explicitement marquées `ranking-only`.

La [fiche conceptuelle](../01-concepts/rappel-memoire-situationnel.md) expose les
sources primaires de Chang et Tsao (2017), Shi et al. (2026), les formules, les
limites de la transposition neuroscientifique et le protocole de comparaison terrain.

## Tests du lot

Commande exécutée avec code de sortie zéro après les dernières modifications de code :

```bash
npm --prefix backend run test:memory-recall
```

Résultats observés :

```text
Situational recall: structural transfer, phase switching, diversity, authority boundary and bounds passed.
Situational recall runtime: SQLite retrieval, scope, inhibition, provenance, prompt, mission options and zero budget passed.
```

- [Test du classement](../../backend/tests/test_situational_recall.js) : une expérience
  SQLite de coordination passe devant un incident réseau lexicalement mieux noté
  pour une requête d'écritures concurrentes ; le classement désactivé conserve l'ordre
  initial. Le test couvre aussi les phases, la diversité, les doublons, les bornes,
  les dates SQLite UTC, les dates invalides et la préservation des champs de preuve.
- [Test runtime](../../backend/tests/test_situational_recall_runtime.js) : base SQLite
  temporaire, recherche réelle, filtrage d'un autre projet et d'une autre mission,
  exclusion d'une mémoire non vérifiée et d'une mémoire inhibée, provenance rendue
  dans le prompt, transmission de `recallPhase` par l'adaptateur de mission,
  retour au classement précédent et budget historique nul.

Le changement de rang selon la présence de références ne modifie pas un champ
`isEpistemicallyValid: false`. Une référence historique disponible pour inspection
ne constitue pas une preuve indépendante.

## Régressions mémoire exécutées

Les programmes suivants ont terminé avec code zéro pendant l'intégration :

```text
test_memory_invariants.js
test_memory_prompt_project_scope.js
test_memory_quality_provenance_contamination.js
test_trinity_memory_sealing.js
test_memory_consolidation_provenance.js
test_memory_critique_corrections.js
test_agent_memory_runtime_wiring.js
test_memory_plasticity_concepts.js
test_orchestrator_memory_deadline.js
test_request_memory_routing.js
```

Les relances des tests de stockage ont utilisé un `GENOS_DB_PATH` temporaire par
programme, `GENOS_DISABLE_DOTENV=1`, `NODE_ENV=test` et
`GENOS_EMBEDDING_PROVIDER=none`. La première tentative de
`test_memory_quality_provenance_contamination.js` avec la configuration de base a
échoué pendant la migration du ledger existant :
`GVX_LEDGER_CHAIN_INVALID / control-plane-mac-mismatch`.
La relance isolée a passé ses six contrôles. Le lot ne modifie pas le ledger GVX.

## Contrôles du dépôt

| Contrôle | Résultat observé |
| --- | --- |
| Analyse des fichiers source du lot avec le gate existant | Zéro violation sur les fichiers du lot |
| `python scripts/ci/check_adr_index.py` | 837 fichiers, 837 entrées, zéro problème |
| Liens relatifs des trois nouveaux documents | Toutes les cibles existent |
| `git diff --check` sur les fichiers suivis du lot | Code zéro |
| `python scripts/ci/check_code_quality.py` | Échec global : 7 370 fichiers source, 58 violations dont 56 hors baseline, toutes hors lot |
| `npm test` | Échec dans `test_worker_native_lifecycle.js` : migration `GVX_LEDGER_CHAIN_INVALID / control-plane-mac-mismatch` sur la configuration de base |
| `cargo test --workspace` | Code zéro ; 909 tests réussis, zéro échec, zéro ignoré dans 116 blocs de résultats |

La relance de `test_worker_native_lifecycle.js` avec une base temporaire,
`GENOS_DISABLE_DOTENV=1`, `NODE_ENV=test` et les embeddings désactivés a terminé
avec code zéro : `Native lifecycle: evidence persistence, guard halt, cancellation,
immutable input and zero usage PASS`. Cette relance précise le rôle de la
configuration de stockage ; elle ne transforme pas le premier `npm test` en
réussite globale et ne couvre pas les étapes que cette commande n'a pas atteintes.

Le premier passage du gate avait signalé une complexité ajoutée dans le rendu des
métadonnées mémoire. Le rendu et l'estimation partagent maintenant
[historicalMemoryMetadata.js](../../backend/src/services/memory/historicalMemoryMetadata.js).
Les contrôles ciblés puis le second passage global ne signalent plus de violation
dans les fichiers de ce lot. Les 56 violations restantes concernent notamment
des runtimes, des services d'Ontogenèse et des benchmarks extérieurs au lot.

Les suites générales sont exécutées sur un arbre de travail qui contient d'autres
changements ; leurs résultats ne permettent pas d'attribuer automatiquement une
régression à ce lot. Aucun accès MCP GenOS n'était disponible dans cette session :
aucun snapshot ou reçu d'expérience MCP n'est revendiqué.

## Empreinte du code et des tests du lot

SHA-256 : `d51bcacca551328b3519fb42198464eeb32e7bfcabac269e5a69b24c2c2b9119`.

Calcul : chemins suivants triés, chaque chemin UTF-8 suivi de NUL, contenu avec
fins de ligne normalisées LF, puis NUL ; concaténation passée dans SHA-256.

```text
backend/bin/agent-runtime-session.cjs
backend/src/services/agentMemoryPrompt.js
backend/src/services/agentRuntimeAdapter/missionLease.js
backend/src/services/memory/historicalMemoryMetadata.js
backend/src/services/memory/memoryContextCompiler.js
backend/src/services/memory/situationFeatures.js
backend/src/services/memory/situationalRecallService.js
backend/tests/test_situational_recall.js
backend/tests/test_situational_recall_runtime.js
```

## Ce que ces observations permettent de conclure

Le comportement de classement et son raccordement au prompt sont vérifiés sur des
cas déterministes et une base isolée. Ces résultats ne quantifient pas une économie
de tokens, une baisse des erreurs répétées ou un gain de réussite sur des missions
réelles. Une campagne appariée avec cas réservés et oracles indépendants reste
nécessaire avant de revendiquer ces gains ou d'apprendre de nouveaux poids.
