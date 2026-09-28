# Inventaire canonique des concepts biologiques

- **Statut** : Référence — inventaire vérifiable, pas preuve d'intégration.
- **Portée** : `crates/genos-biology`, `crates/genos-cell`, `crates/genos-genome`,
  `crates/genos-immune`, `crates/genos-reproduction`, `crates/genos-sensorimotor`,
  `backend/src/services/*`, outils MCP `genos_biomimicry_*`.
- **Dernière revue** : 2026-09-28.
- **Cycle cible** : état observé → signal typé → décision sous budget et
  permissions → effet vérifiable → reçu et provenance → état persisté.

Chaque ligne donne le chemin de code réel. L'absence de chemin signifie
« proposition », pas « implémenté ».

## 1. Cellule

| Capacité | Code | Test |
| --- | --- | --- |
| `AgentCell`, organites, apoptose | `crates/genos-cell/src/lib.rs` | `crates/genos-cell/src/tests.rs` |
| Division, sénescence, Hayflick | `crates/genos-cell/src/division.rs` | `crates/genos-cell/src/tests.rs` |
| Clinique, diagnostic | `crates/genos-cell/src/clinical.rs` | `crates/genos-biology/src/lib.rs` (tests cliniques) |
| Intéroception, autopoïèse | `crates/genos-cell/src/interoception.rs`, `autopoiesis.rs` | tests unitaires crate |

## 2. Génome et épigénétique

| Capacité | Code | Test |
| --- | --- | --- |
| `Genome`, gènes, GRN | `crates/genos-genome/src/genome.rs`, `gene.rs`, `grn.rs` | tests crate genome |
| Épigénome, marques | `crates/genos-genome/src/epigenome.rs` | tests crate genome |
| Mutations, taux, échelles | `crates/genos-genome/src/mutation_rates.rs`, `mutation_scales.rs` | tests crate genome |
| Reproduction, crossover | `crates/genos-genome/src/reproduction.rs`, `crates/genos-reproduction/` | tests reproduction |
| Phénotype | `crates/genos-biology/src/phenotype.rs`, `crates/genos-genome/src/phenotype.rs` | tests phénotype |

## 3. Métabolisme et homéostasie

| Capacité | Code | Test |
| --- | --- | --- |
| Réservoir ATP, entropie | `crates/genos-cell/src/autopoiesis.rs` (`MetabolicPool`) | tests cell |
| Glycolyse | `crates/genos-biology/src/glycolysis.rs` | tests biology |
| Régulation cognitive, budgets | `crates/genos-cell/src/cognitive_regulation.rs` | tests cell |

## 4. Neurobiologie et mémoire

| Capacité | Code | Test |
| --- | --- | --- |
| Réseaux, glie, redondance | `crates/genos-biology/src/neurobiology/`, `glial.rs`, `redundancy.rs` | tests biology |
| Chimie, signalisation, quorum | `crates/genos-biology/src/chemistry.rs`, `signaling.rs`, `quorum.rs` | tests biology |

## 5. Immunité, pathologie, thérapie

| Capacité | Code | Test |
| --- | --- | --- |
| Pathologies | `crates/genos-biology/src/pathology.rs` | `lib.rs` tests cliniques |
| Thérapies systémiques | `crates/genos-biology/src/therapy.rs`, `therapy_extended.rs` | `lib.rs` tests thérapie |
| Crate immunité | `crates/genos-immune/src/` | tests crate immune |

## 6. Sens et instinct

| Capacité | Code | Test |
| --- | --- | --- |
| VNO, électroréception, Cluster N, tectum, écholocation | `crates/genos-biology/src/sensory/*.rs` | tests modules sensory |
| PAF, stimulus, IRM | `crates/genos-biology/src/instinct/*.rs` | `instinct/tests.rs` |
| Sensorimoteur | `crates/genos-sensorimotor/src/` | tests crate |

## 7. Écologie et populations

| Capacité | Code | Test |
| --- | --- | --- |
| Écologie, biocénose | `crates/genos-biology/src/ecology.rs` | tests biology |
| Embryologie, tissus, spores | `crates/genos-biology/src/embryology.rs`, `tissue.rs`, `spore.rs` | tests biology |

## 8. Reproduction et lignées

| Capacité | Code | Test |
| --- | --- | --- |
| Réplication, fossilisation | `crates/genos-reproduction/src/`, `crates/genos-genome/src/fossil.rs`, `replay.rs` | tests reproduction |

## 9. Cellules spécialisées

| Capacité | Code | Test |
| --- | --- | --- |
| Cnidocyte | `crates/genos-biology/src/specialized_cells/cnidocyte.rs` | tests module |
| Électrocyte | `.../electrocyte.rs` | tests module |
| Choanocyte | `.../choanocyte.rs` | tests module |
| Iridophore | `.../iridophore.rs` | tests module |
| Cellule de garde | `.../guard_cell.rs` | tests module |
| Trachéide | `.../tracheid.rs` | tests module |
| Procaryote / HGT | `.../prokaryote.rs` | tests module |

## 10. Organisme de mission

| Capacité | Code | Test |
| --- | --- | --- |
| Orchestration, survie | `crates/genos-orchestrator/src/`, `backend/bin/genos-orchestrate.cjs` | tests orchestrateur |
| Stockage, snapshots | `crates/genos-store/src/`, backend SQLite | tests store/backend |

## Voir aussi

- [maturite-biologique.md](maturite-biologique.md) — niveaux documentée, primitive,
  intégrée, validée.
- [cellulaire-specialise.md](cellulaire-specialise.md) — limites des modules exotiques.
- [sens-animaux.md](sens-animaux.md) — limites des super-sens.
- [web-foraging.md](web-foraging.md) — exemple de description honnête déjà alignée.
