# ADR 0001 — AgentDNA : format héréditaire binaire

- **Statut** : Accepté
- **Date** : 2026-09-13
- **Domaine** : Génome, reproduction, runtime agentique, persistance
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : [spec/AGENT_DNA_SPEC.md](../../spec/AGENT_DNA_SPEC.md), [docs/01-concepts/genome-et-epigenetique.md](../01-concepts/genome-et-epigenetique.md), [docs/02-orchestration/reproduction-et-replication.md](../02-orchestration/reproduction-et-replication.md), [.genos.md](../../.genos.md) (règle 5)

## Contexte

GenOS possède déjà un substrat ADN réel dans le cœur Rust :

- `crates/genos-genome/src/genome.rs` définit `Genome` avec chromosomes maternel/paternel, gènes localisés, chromatine, méthylation, activateurs/répresseurs, exons, plasmides, rétrovirus endogènes, enhancers, chromosomes extra, `bud_scars`, `ploidy`, `generation`, `parent_ids`, `hayflick_limit`.
- `crates/genos-genome/src/dna.rs` et `translation.rs` implémentent la synthèse de brins, la transcription, l'épissage, la traduction par codons et le repliement.
- `crates/genos-reproduction/src/` implémente le crossing (single point, uniforme, barrière de spéciation), la division (mitose, fission binaire, bourgeonnement, schizogonie, méiose) et la phylogénie.
- `crates/genos-cli/src/commands/reproduction.rs` et `reproduction_division.rs` exposent déjà `genos evolution crossover|division|assimilate-plasmid|phylogeny`.

Cependant, ce substrat est **déconnecté** du runtime et mal outillé :

1. Il est sérialisé en **JSON ad hoc** via `serde_json` et stocké dans `<matrix_root>/chromatin/<agent_id>.json`.
2. Il n'est relié ni aux agents SQLite (`agents`), ni à `agentFleetWorkers.js`, ni au format gène pauvre `{role, strategy, tools, temp, topP}` utilisé par `geneticsService.crossoverGenome`.
3. Les 226 manifestes `AgentGenome` (`agents/*.agent.json`) sont des identités/politiques portables, **non héréditaires**.
4. Le backend a déjà adopté une doctrine « bio-polymère » qui remplace le JSON par du binaire dense : `backend/src/services/bioPolymerPersistenceService.js` encode en MessagePack (`msgpackr`) dans des colonnes BLOB, avec migration `backend/bin/migrate_msgpack.js`.

Contrainte produit explicite : **éviter le JSON au maximum** au profit de technologies plus performantes, plus rapides et plus utiles, pour un format capable de porter injection, naissance, croisement, mutation, clonage et leurres.

## Décision

Adopter un format héréditaire binaire canonique **`AgentDNA` v1** :

1. **Conteneur binaire** : magic `GDNA`, en-tête fixe de 32 octets, table de sections, CRC32 par section, signature Ed25519 optionnelle.
2. **Séquences nucléotidiques packées 2 bits** : `A=00`, `C=01`, `G=10`, `T=11`, 4 bases par octet (ordre haut→bas), aligné sur `DnaStrand::synthesize`.
3. **Parties structurées en MessagePack**, jamais en JSON : `msgpackr` côté Node (déjà présent), `rmp-serde` côté Rust (nouvelle dépendance). Les brins restent en `bin` brut.
4. **Hash canonique SHA-256** sur la concaténation ordonnée des octets de sections (même primitive que `content_hash` / `hash_library`, mais digest recalculé car la sérialisation canonique change) ; identifiants tronqués à 16 octets pour les usages internes, avec table de correspondance legacy lors de la migration.
5. **Lecture zero-copy** en Rust via des vues de sections (`DnaView`), sans désérialiser les brins, pour le chemin chaud.
6. **JSON uniquement toléré en lecture legacy** pour migrer `<matrix_root>/chromatin/*.json`, jamais produit en écriture.

## Alternatives considérées

| Option | Avantages | Inconvénients | Verdict |
| --- | --- | --- | --- |
| JSON | lisible, déjà en place | ~10–20× plus volumineux, lent, inadapté au 2 bits, dette existante | Rejeté |
| Protobuf (`protobufjs` déjà présent, `prost` côté Rust) | schéma fort, compact, cross-langage | codegen + étape de build, rigidité de schéma | Écarté (MessagePack déjà adopté) |
| `rkyv` (Rust zero-copy) | désérialisation quasi nulle | non cross-langage | Écarté pour l'interchange ; possible accélérateur mémoire plus tard |
| CBOR | équivalent MessagePack | outillage moins présent dans le dépôt | Écarté |
| FASTA/ASCII lisible | débogage humain | 1 octet/base, 4× plus gros | Réservé à un export debug |

## Conséquences

**Positives**

- Densité : brins 4× plus compacts que l'ASCII, sections structurées compactées par MessagePack.
- Vitesse : pas de parsing JSON, accès direct par offsets, vues zero-copy côté Rust.
- Cohérence : s'aligne sur la doctrine bio-polymère déjà en production (`msgpackr`).
- Fondation unique pour `inject`, `birth`, `cross`, `mutate`, `clone`, `decoy`.
- Même primitive de hash que l'existant (SHA-256) ; les digests sont recalculés et une table de correspondance legacy assure la transition.

**Négatives**

- Nouvelle dépendance Rust `rmp-serde` (Node est déjà prêt avec `msgpackr`).
- Outillage à créer : `genos genome compile|validate|inspect|express`.
- Migration des JSON `chromatin/*.json` vers `.dna`.
- Canonicalisation MessagePack à contraindre (ordre de clés et ordre de sections fixés par la spec).

**Risques et garde-fous**

- Un génome porte des prompts et des politiques d'outils → **entrée non fiable** : allowlist de loci, plafonds de longueur, expression en sandbox, signature Ed25519 **si une clé est déployée** (sans clé, la chaîne d'intégrité n'est pas fermée — le vérificateur est strict Ed25519 sans HMAC fallback), scope tenant, circuit breaker.
- Une mutation ou un croisement peut produire un génome non viable → validation `Genome::validate` obligatoire avant persistance.
- Les leurres ne doivent jamais altérer la provenance auditable : le marqueur caché vit dans une section `PROV` signée, pas dans le phénotype exprimé.

## Suivi

- ADR ultérieure pour l'expression runtime (ADN → gènes/prompt au spawn) et l'administration d'ADN par les orchestrateurs.
- RFC/ADR pour la table `agent_genomes` et le pont avec `lineage_nodes` / `lineage_edges`.

## Conformité

- `.genos.md` règle 5 (écart d'architecture sans ADR interdit) : satisfait par le présent document.
- Les fichiers de documentation sont hors du périmètre du gate `scripts/ci/check_code_quality.py`.

## Références de code

- `crates/genos-genome/src/genome.rs`, `gene.rs`, `dna.rs`, `translation.rs`
- `crates/genos-reproduction/src/crossover.rs`, `division.rs`, `division_phases.rs`, `phylogeny.rs`, `seed.rs`
- `crates/genos-cli/src/commands/reproduction.rs`, `reproduction_division.rs`
- `backend/src/services/bioPolymerPersistenceService.js`, `biomimeticSignalingBus.js`, `cryptobiosisSporeService.js`
- `backend/src/services/geneticsService.js`, `nucleotideTranslationService.js`, `agentEvolutionService.js`
- `backend/bin/migrate_msgpack.js`
