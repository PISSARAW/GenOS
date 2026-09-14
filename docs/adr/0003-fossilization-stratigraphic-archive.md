# ADR 0003 — Fossilisation stratigraphique : archive terminale des lignées

- **Statut** : Proposé
- **Date** : 2026-09-14
- **Domaine** : Persistance, mémoire, orchestration, preuve, biomimétique
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : [docs/01-concepts/fossilisation.md](../01-concepts/fossilisation.md), [docs/01-concepts/memoire-et-apprentissage.md](../01-concepts/memoire-et-apprentissage.md), [docs/04-exploitation/resilience-et-reprise.md](../04-exploitation/resilience-et-reprise.md), [docs/01-concepts/epistemologie-et-evidence.md](../01-concepts/epistemologie-et-evidence.md), [adr/0002-agentdna-innovation-loop.md](0002-agentdna-innovation-loop.md), [.genos.md](../../.genos.md) (règle 5)

## Contexte

GenOS dispose déjà d'un **registre de fossiles mince** mais fonctionnel de bout en bout :

- Cœur Rust `crates/genos-store/src/fossil.rs` : `FossilRecord { fossil_id, extinct_lineage_id, reason, recorded_at }` et `FossilRegistry { fossilize, all_fossils }`.
- Orchestrateur `crates/genos-orchestrator/src/ecosystem.rs` : champ `fossils`, `fossilize(...)`, `fossil_history()`.
- CLI `crates/genos-cli/src/commands/store_ops.rs` : `handle_fossil_record` / `handle_fossil_list`, persistance JSON dans `<matrix_root>/fossils/` avec `stratum: "STRATIGRAPHIC_FOSSIL"`.
- Backend : pont `genosCli.runFossilize` / `runListFossils`, primitives `fossilize` / `fossil_record` / `fossil_list` (`primitiveHandlers/safety.js`), et **auto-fossilisation à l'apoptose** (`apoptosis()` → `fossilizeTerminatedTarget`).

Cependant ce registre est **insuffisant pour porter le concept de fossilisation** :

1. Il n'enregistre **ni le contenu** préservé, **ni un hash** d'intégrité : impossible de détecter une réécriture post-hoc, contrairement à `AgentDNA`, `Capsule` et `SporeVitrifiedPayload`.
2. Il ne **distingue pas** la préservation réversible (cryptobiose, snapshots) de l'archive terminale irréversible, ce qui brouille la sémantique.
3. Il n'expose **aucun mode de taphonomie** (pétrification, moule interne/externe, trace) alors que le mode moule est nécessaire pour les états non retenables (secrets, coût).
4. Il n'a **pas de strates** : aucune datation/ordination des extinctions (fossiles stratigraphiques).
5. Il n'enregistre **aucun marqueur phénotypique** (l'équivalent des mélanosomes) qui seuls permettent de reclasser un fossile.
6. Il est **in-memory** dans le cœur Rust et reconstruit à chaque appel CLI : la persistance dépend entièrement de fichiers JSON non indexés.

La doctrine du dépôt (`.genos.md`, `docs/README.md`) impose qu'un terme biologique **organise des invariants** et ne masque pas une absence de preuve : le concept de fossilisation doit donc devenir explicite et probant, pas rester un label.

## Décision

Introduire la **fossilisation stratigraphique** comme couche d'archive **terminale, immuable et irréversible** des lignées d'agents, en étendant le registre existant :

1. **Pipeline de taphonomie synchrone** déclenché à la terminaison : enfouissement rapide (capture avant GC) → décomposition sélective (triage parties dures / tissus mous) → pétrification (`payload_hash = SHA-256`) → moulage si la matière n'est pas retenable → dépôt en strate.
2. **Modèle enrichi** : `FossilizationMode { Petrification, ExternalMold, InternalMold, Trace }`, `SedimentStratum`, `Melanosome`/`MelanosomeShape`, `PhenotypeReading`/`PhenotypeClass`, `BurialContext`, `FossilSpecimen` ; `FossilRecord` gagne `payload_hash`, `mode`, `conservation_quality`, `stratum_id`, `phenotype_markers`, `hard_parts`, `soft_parts_lost`, `mineral_payload`.
3. **Persistance indexée** : tables `fossils` et `fossil_strata` (mêmes conventions que `cryptobiosis_snapshots` / `agent_state_snapshots`), en plus des JSON existants pour compatibilité.
4. **Réutilisation des primitives existantes** : `Capsule` (hash SHA-256), `SnapshotStore`, `SporeVitrifiedPayload` et `bioPolymerPersistenceService` (MessagePack BLOB) ; aucune nouvelle primitive de stockage.
5. **Surface opérateur** : CLI `genos fossil record|list|strata|excavate|decode`, endpoints REST `/api/fossils*`, outils MCP `genos_fossil_record|list|excavate|strata`.
6. **Irrécversibilité garantie** : `excavate` et `decode` sont **lecture seule** ; **aucune API** de résurrection ni de promotion d'un fossile en branche active. Les concepts résiduels ne peuvent entrer dans la boucle d'innovation que comme **candidats** soumis au gate de preuve (ADR 0002).
7. **Biais de conservation explicite** : le seuil de signification `θ` et la qualité `Q` sont journalisés ; le mode et le hash sont vérifiés à l'excavation.

Règles structurantes :

- **Auto-fossilisation** conservée sur apoptose/purge, mais désormais probante (hash + strate + marqueurs).
- **Séparation stricte** avec les mécanismes réversibles : snapshot = restauration, capsule = intégrité, cryptobiose = reprise, fossile = preuve terminale.
- **Respect du gate de code** : fonctions ≤ 3 paramètres (regroupement en `BurialContext` / `TaphonomyPolicy`), fichiers ≤ 400 lignes (`scripts/ci/check_code_quality.py`).

## Alternatives considérées

| Option | Avantages | Inconvénients | Verdict |
| --- | --- | --- | --- |
| Conserver le registre mince actuel | zéro coût | pas d'intégrité, pas de strates, pas de phénotype, ambigu avec la cryptobiose | Rejeté |
| Réutiliser `agent_git_archives` / snapshots | primitives existantes | sémantique de restauration, pas d'archive terminale ni de biais explicite | Écarté |
| Nouveau moteur de stockage dédié | contrôle total | duplication, dette, ignore `Capsule`/SnapshotStore | Rejeté |
| Étendre `FossilRegistry` + tables SQLite, réutiliser les primitives | cohérent, borné, probant | nouvelles tables et colonnes | **Retenu** |
| Archiver en JSON seul | simple | non indexé, pas de datation ni de requêtes | Réservé (compat) |

## Conséquences

**Positives** : archive terminale probante et falsifiable (hash), datation par strates, reclassification possible via mélanosomes, séparation nette avec les mécanismes réversibles, réutilisation des primitives de persistance, aucune rupture des flux existants (auto-fossilisation déjà en place).

**Négatives** : nouvelles tables/colonnes (`fossils`, `fossil_strata`), extension du crate `genos-store`, nouvelle surface CLI/REST/MCP à maintenir, risque de dérive « entrepôt de blobs » si le mode moule est mal utilisé.

**Risques et garde-fous** : réécriture post-hoc → `payload_hash` vérifié à l'excavation ; surinterprétation d'un échantillon biaisé → `conservation_quality` et `θ` journalisés ; confusion avec la reprise → documentation et tests qui interdisent toute promotion ; secrets/contenu sensible → mode `ExternalMold`/`InternalMold` privilégié ; canonicalisation → ordre ASCII des sections aligné Rust/Node comme `AgentDNA`.

## Suivi

- [x] Couche Rust (`fossil.rs` : `BurialContext`, `bury`/`excavate`/`strata`) et service `fossilizationService.js` avec les tables `fossils` / `fossil_strata`.
- [x] Commandes CLI `record --mode|list|strata|excavate|decode` et primitives orchestrateur `fossilize|bury_fossil|fossil_strata|fossil_excavate|fossil_decode`.
- [x] Tests : burial synchrone déterministe, propriété « excavation = lecture seule, non promouvable », intégrité inter-langage Rust/Node.
- [ ] Outils MCP `genos_fossil_*` et endpoints REST `/api/fossils*` (alignement JS/Rust/bridge, cf. `docs/03-reference/outils-mcp.md` §9).
- [ ] Brancher la détection de concepts résiduels vers la boucle d'innovation (ADR 0002) en statut `candidate` uniquement.
- [ ] ADR ultérieure si un format binaire canonique de fossile (`FossilDNA`) est introduit.

## Conformité

- `.genos.md` règle 5 (écart d'architecture sans ADR interdit) : satisfait par le présent document.
- `.genos.md` règles 1–4 (complexité, ≤ 3 paramètres, SOLID, ≤ 400 lignes) : imposées à l'implémentation via `scripts/ci/check_code_quality.py`.
- Les fichiers de documentation sont hors du périmètre du gate de qualité de code.

## Références de code

- `crates/genos-store/src/fossil.rs`, `capsule.rs`, `snapshot.rs`, `cryptobiosis.rs`, `lib.rs`
- `crates/genos-orchestrator/src/ecosystem.rs` (`fossils`, `fossilize`, `fossil_history`)
- `crates/genos-cli/src/args/store_extra.rs`, `crates/genos-cli/src/commands/store_ops.rs`
- `backend/src/services/genosCli.js` (`runFossilize(lineageId, reason, mode)`, `runListFossils`)
- `backend/src/services/fossilizationService.js`, `backend/src/db/migrations/migrateFossilization.js`
- `backend/src/services/primitiveHandlers/safety.js` (`fossilizeTerminatedTarget`, `apoptosis`, `fossilize`, `fossilStrata`, `fossilExcavate`, `fossilDecode`, `listFossils`), `primitiveHandlers/handlersRegistry.js`
- `backend/src/services/bioPolymerPersistenceService.js`, `cryptobiosisSporeService.js`, `sleepCycle.js`, `episodicMemoryService.js`
- `backend/src/db/schema-migrations.js`, `schema-tables-core.js`, `schema-tables-extensions.js` (`cryptobiosis_snapshots`, `agent_state_snapshots`, `agent_git_archives`)
- `crates/genos-orchestrator/tests/fossilization.rs`, `backend/tests/test_fossilization_service.js`, `backend/tests/test_orchestrator_fossilization.js`
- `docs/01-concepts/fossilisation.md`, `docs/01-concepts/memoire-et-apprentissage.md`, `docs/04-exploitation/resilience-et-reprise.md`, `docs/04-exploitation/cli-et-experience-operateur.md`, `docs/03-reference/persistance-et-donnees.md`
