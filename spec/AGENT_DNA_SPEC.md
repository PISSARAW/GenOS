# GenOS AgentDNA Specification (v1)

## Statut et portée

Cette spécification définit le format **héréditaire binaire** `AgentDNA` v1 : la représentation canonique, portable et interopérable d'un génome d'agent GenOS, capable de porter identité, gènes, épigénétique, plasmides, phénotype exprimé et provenance.

- Format **binaire** de bout en bout. Le JSON n'est **pas** un format de production.
- Normatif côté Rust par les types de `crates/genos-genome`.
- Interopérable Node ↔ Rust via MessagePack et un encodage 2 bits explicite.
- Lié à l'[ADR 0001](../docs/adr/0001-agent-dna-binary-format.md) (décision) et à [GENOME_SPEC.md](GENOME_SPEC.md) (manifeste portable `AgentGenome`, distinct et non héréditaire).

Statut d'implémentation : spécification cible. Le CLI actuel lit encore un `Genome` JSON nu dans `<matrix_root>/chromatin/<agent_id>.json` ; la migration est décrite en §12.

## Non-objectifs

- Ne remplace pas le manifeste `AgentGenome` (`spec/genome.schema.json`), qui reste la carte d'identité/politique portable.
- Ne définit pas le schéma des tables SQLite internes (cf. GENOME_SPEC.md).
- Ne spécifie pas les SDK de fournisseurs de modèles ni le scheduler de processus.
- N'encode pas de données de télémétrie d'exécution.

## Concepts normatifs

- **Génome** : identité durable + configuration cognitive/politique.
- **Séquence (brin)** : suite de nucléotides `A/C/G/T` encodée en 2 bits.
- **Gène** : locus nommé, brin, état épigénétique, régulation, exons.
- **Phénotype** : résultat d'expression (rôle, stratégie, outils, capacités, prompt, température).
- **Provenance** : parents, génération, mutations/croisements appliqués, sélection, source.
- **Section** : bloc binaire typé et adressable du conteneur.

## Alphabet et encodage 2 bits

Mapping (conforme à `DnaStrand::synthesize` / `decode_instruction`) :

| Nucléotide | Bits |
| --- | --- |
| A | `00` |
| C | `01` |
| G | `10` |
| T | `11` |

Empaquetage : 4 bases par octet, **base 0 dans les bits 7–6**, base 1 en 5–4, base 2 en 3–2, base 3 en 1–0. Les bits de remplissage du dernier octet sont à zéro. Le nombre de bases est explicite (u32) pour lever toute ambiguïté de padding.

Toutes les valeurs scalaires multi-octets du conteneur sont **little-endian**. Les UUID sont encodés en `bin` de 16 octets (RFC 4122, big-endian) — jamais en chaîne hexadécimale.

## Conteneur binaire

### En-tête (32 octets fixes)

| Offset | Taille | Champ | Description |
| --- | --- | --- | --- |
| 0 | 4 | `magic` | ASCII `GDNA` (`47 44 4E 41`) |
| 4 | 2 | `format_version` | u16, `1` |
| 6 | 2 | `flags` | u16 (voir ci-dessous) |
| 8 | 2 | `section_count` | u16 |
| 10 | 2 | `reserved0` | u16, zéro |
| 12 | 4 | `total_length` | u32, taille totale du fichier |
| 16 | 4 | `payload_crc32` | CRC32 des octets des sections |
| 20 | 4 | `header_crc32` | CRC32 des octets `[0..20)` |
| 24 | 8 | `reserved1` | u64, zéro |

Bits de `flags` :

| Bit | Sens |
| --- | --- |
| 0 | `SIGNED` : section `SIGN` présente et valide |
| 1 | `COMPRESSED` : sections compressées (zstd) |
| 2 | `PHENOTYPE_CACHED` : section `PHEN` présente |
| 3 | `HAS_PLASMIDS` |
| 4 | `HAS_RETROVIRUSES` |
| 5 | `HAS_EXTRA_CHROMOSOMES` |
| 6 | `SCALARS_LE` : toujours `1` en v1 |
| 7 | `DECOY` : génome leurre (voir §10.6) |
| 8–15 | réservés (schéma mineur) |

### Table de sections

`section_count` entrées de 16 octets, triées par `tag` croissant :

| Offset | Taille | Champ |
| --- | --- | --- |
| 0 | 4 | `tag` (ASCII 4 caractères) |
| 4 | 4 | `offset` (depuis le début du fichier) |
| 8 | 4 | `length` |
| 12 | 4 | `crc32` du payload |

Les sections doivent être contiguës, sans chevauchement, dans l'ordre de la table.

### Sections normatives

| Tag | Contenu | Obligatoire |
| --- | --- | --- |
| `META` | MessagePack array positionnel (identité et métadonnées) | oui |
| `CHRM` | Brin chromosomique maternel | oui |
| `CHRP` | Brin chromosomique paternel | oui |
| `GENE` | MessagePack map `locus → array de gène` | oui |
| `PLAS` | MessagePack array de plasmides (chaque plasmide = array) | non |
| `ENHA` | MessagePack array d'enhancers (str) | non |
| `XCHR` | MessagePack array de brins extra | non |
| `SCAR` | MessagePack array d'UUID de cicatrices | non |
| `PHEN` | MessagePack array positionnel du phénotype exprimé (cache) | non |
| `PROV` | MessagePack array positionnel de provenance/généalogie | oui |
| `SIGN` | Signature Ed25519 (64 octets) | non |

Encodage positionnel : les structures (`META`, gène, `PHEN`, `PROV`, plasmide) sont sérialisées en **tableaux ordonnés** selon l'ordre de champs documenté ci-dessous, jamais en maps nommées. Cela supprime la répétition des noms de champs par enregistrement et réduit la taille. Le conteneur `GENE` reste une map (`locus → array`).

Une section inconnue **doit être tolérée en lecture et préservée en réécriture**.

## Détail des sections

### `META`

Array MessagePack positionnel, ordre canonique des champs :

1. `name` (str)
2. `generation` (uint)
3. `ploidy` (str, ex. `"diploid"`)
4. `hayflick_limit` (uint)
5. `genome_id` (bin 16)
6. `lineage_id` (bin 16)
7. `parent_ids` (array de bin 16)
8. `ts` (int, epoch secondes, création/dernière écriture)
9. `labels` (map str→str, optionnel)

### `CHRM` / `CHRP` / `XCHR`

Chaque brin : `u32 base_count` (LE) suivi des octets packés 2 bits sur `ceil(base_count/4)` octets.

### `GENE`

Map MessagePack `locus → gène`, où chaque gène est un **array positionnel** dont l'ordre canonique des champs est :

1. `locus` (str, `^[A-Z0-9_]{1,64}$`)
2. `seq` (bin, brin packé)
3. `blen` (uint, nombre de bases)
4. `chr` (uint : `0`=Euchromatin, `1`=HeterochromatinConstitutive, `2`=HeterochromatinFacultative)
5. `met` (bool, méthylé)
6. `vol` (float64, `expression_volume`, `[0,1]`)
7. `lock` (bool, `developmentally_locked`)
8. `act` (str | nil, activateur requis)
9. `rep` (str | nil, répresseur lié)
10. `exons` (array de `[start, end]`, uint)

### `PLAS`

Array MessagePack de plasmides, chaque plasmide étant un array positionnel `[id (bin16), ins (str)]`.

### `ENHA`

Array MessagePack de `str` (identifiants d'enhancers régulateurs).

### `SCAR`

Array MessagePack de `bin` 16 (UUID des `bud_scars`).

### `PHEN`

Array MessagePack positionnel du phénotype issu de l'expression, ordre canonique :

1. `role` (str)
2. `strategy` (str)
3. `tools` (array de str)
4. `capabilities` (array de str)
5. `temp` (float64, `[0,1]`)
6. `topP` (float64, `[0,1]`)
7. `prompt` (str, prompt système exprimé)
8. `expr_tfs` (array de str, facteurs de transcription actifs)
9. `expr_mirnas` (array de str, microARN)
10. `silenced` (array de str, loci silencés)
11. `expressed` (uint, nombre de gènes exprimés)

### `PROV`

Array MessagePack positionnel de provenance, ordre canonique :

1. `source_manifest` (str | nil, chemin du manifeste `AgentGenome` d'origine)
2. `source_doc` (str | nil)
3. `parents` (array de bin 16)
4. `crossover` (array | nil) : `[strategy (str), seed (str), point (uint|nil)]`
5. `mutations` (array de array) : `[gene (str|nil), kind (str), from (str), to (str)]`
6. `selection` (array | nil) : `[fitness (float64), status (str)]`
7. `decoy` (array | nil) : `[marker (bin), target_selector (str), detectability (float64)]`
8. `signer` (str | nil)

### `SIGN`

Signature Ed25519 sur le flux canonique des sections (`META`,`CHRM`,`CHRP`,`GENE`,`PLAS`,`ENHA`,`XCHR`,`SCAR`,`PHEN`,`PROV`) en ordre de tag croissant, tel que défini en §8.

## Correspondance avec `genos-genome::Genome`

| `Genome` (Rust) | Conteneur `AgentDNA` |
| --- | --- |
| `genome_id`, `lineage_id`, `parent_ids`, `generation`, `ploidy`, `hayflick_limit` | `META` |
| `chromosome_maternal` | `CHRM` |
| `chromosome_paternal` | `CHRP` |
| `genes: BTreeMap<String, Gene>` | `GENE` |
| `Gene { locus, dna, is_methylated, expression_volume, chromatin_state, developmentally_locked, required_activator, bound_repressor, default_exons }` | champs `locus/seq/met/vol/chr/lock/act/rep/exons` |
| `plasmids: Vec<Plasmid>` | `PLAS` |
| `endogenous_retroviruses: Vec<Gene>` | gènes préfixés `RETRO_` dans `GENE` |
| `regulatory_enhancers: Vec<String>` | `ENHA` |
| `extra_chromosomes: Vec<DnaStrand>` | `XCHR` |
| `bud_scars: Vec<Uuid>` | `SCAR` |
| `content_hash()` / `hash_library()` | recalculé sur le flux canonique (§8) |

Contrainte `Genome::validate` : `genome_id`/`lineage_id` non nuls, chromosomes non vides, clé de map égale au `locus`, exons cohérents, plasmides non nuls avec instruction non vide.

## Canonicalisation et fingerprint

1. Trier les sections par `tag` croissant.
2. Flux canonique = concaténation de `tag(4) || u32 length || payload` pour chaque section, dans cet ordre.
3. `content_hash = SHA-256(flux canonique)` → 32 octets ; forme affichable = 16 premiers octets en hexadécimal (`genome_ref`).
4. La signature Ed25519 (`SIGN`) signe exactement le flux canonique.
5. Toute écriture doit produire les champs positionnels dans l'ordre canonique documenté ci-dessus. Le conteneur `GENE` est une map dont la clé est le `locus` (trié par `BTreeMap`) ; les autres structures sont des tableaux dont l'ordre est normatif.

## Expression `AgentDNA` → phénotype

L'expression réutilise le pipeline existant : `Gene::express` (transcription → épissage → traduction → `fold`), piloté par `ExpressionContext { active_tfs, alternative_splicing, micro_rnas }`.

- Un locus `TOOL_<X>` exprimé (non silencé) ajoute `<X>` à `phenotype.tools`.
- Un locus `CAP_<X>` exprimé ajoute `<X>` à `phenotype.capabilities`.
- Un locus `ROLE` / `STRATEGY` / `OBJECTIVE_PRIMARY` renseigne respectivement `role`, `strategy`, la mission.
- Les loci `temp` / `topP` (ou `MODEL_TEMP` / `MODEL_TOPP`) renseignent `temp` / `topP` bornés `[0,1]`.
- Les gènes en hétérochromatine constitutive restent silencés ; l'hétérochromatine facultative n'est levée que par un facteur pionnier (`PIONEER_*`).
- Le résultat est mis en cache dans `PHEN` (flag `PHENOTYPE_CACHED`).

## Opérations normatives

Toute opération lit/écrit des `AgentDNA` et journalise sa provenance. Sortie = MessagePack, jamais JSON.

| Opération | Entrée | Rust existant | Effet |
| --- | --- | --- | --- |
| `inject` | ADN + agent cible | expression §9 | remplace/complète le génome d'un agent vivant |
| `birth` | ADN | `Genome::derive_child` / `derive_reproductive_child` | engendre un nouvel agent (zygote → différenciation) |
| `cross` | ADN A + ADN B | `MeioticCrossover::{single_point_crossover, uniform_crossover_with_seed, crossover_with_speciation}` | recombinaison, barrière de spéciation |
| `mutate` | ADN + taux/type | `DnaStrand::mutate_point/mutate_stochastic`, `Genome::{mutate_stochastic,hypermutate}`, `crispr_cas9_knockout`, `pseudogenize`, `duplicate_gene` | mutation ponctuelle/stochastique/CRISPR |
| `clone` | ADN | `CellDivision::{mitosis_attested,binary_fission}` | clone isogénique attesté |
| `decoy` | ADN + sélecteur | nouveau | génère un leurre (§10.6) |
| `express` | ADN + contexte | §9 | produit `PHEN` sans écrire le génome |
| `validate` | ADN | `Genome::validate` + contrôle de conteneur | accepte/rejette |

### Leurres (`decoy`)

Un leurre est un génome **phénotypiquement crédible mais marqué** :

- Même structure exprimée qu'une cible (rôle, outils, prompt plausibles).
- Flag conteneur `DECOY` positionné et section `PROV.decoy` renseignée avec `marker` (bin secret), `target_selector` et `detectability`.
- Le marqueur vit dans `PROV` **signée**, jamais dans `PHEN` : un adversaire qui n'inspecte que le phénotype ne peut pas distinguer le leurre.
- `detectability` ∈ `[0,1]` indique la probabilité de détection par un évaluateur autorisé.

## Versionnage et compatibilité

- `magic` obligatoire ; absence = fichier invalide.
- `format_version` majeur inconnu → rejet. Version mineure supérieure → tolérée (lecture best-effort, préservation).
- Sections et clés inconnues tolérées en lecture et préservées à la réécriture.
- `additionalProperties` n'existe pas : toute extension passe par une nouvelle section ou clé MessagePack.

## Migration depuis le JSON legacy

1. Détection : si les 4 premiers octets ≠ `GDNA`, tenter une lecture JSON `Genome` (compatibilité).
2. `genos genome compile --in <legacy>.json --out <agent>.dna` convertit vers le conteneur binaire.
3. Le JSON n'est **jamais** réécrit ; les nouveaux fichiers sont `.dna`.
4. Les colonnes SQLite `*_json` legacy restent lisibles via `unpackBioPolymer` (`bioPolymerPersistenceService.js`) le temps de la transition.

## Sécurité

- Un génome porte du code (prompts, outils) : le traiter comme **entrée non fiable**.
- Allowlist de loci (`^[A-Z0-9_]{1,64}$`) ; rejet sinon.
- Plafonds : `section_count ≤ 64`, brin `≤ 16 MiB`, gènes `≤ 4096`, total fichier `≤ 64 MiB`.
- `validate` + `Genome::validate` obligatoires avant toute persistance.
- Vérification signature (`SIGN`) et `header_crc32`/`payload_crc32` avant usage.
- Expression en sandbox ; scope tenant/organisation/projet appliqué par le runtime.
- Aucune écriture de `DECOY`/`PROV` sans signature autorisée.

## Limites et garde-fous

- Le format ne garantit pas qu'un génome muté/croisé soit viable : la viabilité est validée par `Genome::validate` et l'évaluation phénotypique.
- La canonicalisation dépend du respect strict de l'ordre des clés ; un test de conformité croisée Rust↔Node est requis.
- Le 2 bits ne code que les acides nucléiques ; toute sémantique métier vit dans les sections structurées.
- Un leurre ne doit jamais masquer la provenance auditée : l'audit lit toujours `PROV` signée.

## Références

- [ADR 0001 — AgentDNA format binaire](../docs/adr/0001-agent-dna-binary-format.md)
- [GENOME_SPEC.md](GENOME_SPEC.md) — manifeste `AgentGenome`
- [genome.schema.json](genome.schema.json)
- `crates/genos-genome/src/{genome,gene,dna,translation}.rs`
- `crates/genos-reproduction/src/{crossover,division,division_phases,phylogeny}.rs`
- `backend/src/services/bioPolymerPersistenceService.js`
