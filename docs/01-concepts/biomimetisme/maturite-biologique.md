# Maturité des capacités biologiques

- **Statut** : Référence — grille d'évaluation, pas revendication.
- **Dernière revue** : 2026-09-30.
- **Règle** : un statut exige le chemin de code et le test cités. Sans les
  deux, le statut est « proposition ».

## 1. Niveaux

- **documentée** : concept ou contrat décrit dans `docs/`, sans preuve d'appel.
- **primitive** : fonction locale testée (`cargo test -p <crate>`), non appelée
  par un chemin runtime.
- **intégrée** : appelée par un chemin réel du runtime (CLI, backend, MCP,
  orchestrateur), avec lease et permissions quand il s'agit d'un effet.
- **validée** : résultat mesuré par un test bout en bout ou un benchmark
  reproductible (commande, seed, artefacts conservés).

## 2. Matrice actuelle (revue 2026-09-30)

| Concept | Statut retenu | Preuve | Ce qui manque pour le niveau suivant |
| --- | --- | --- | --- |
| Cellule `AgentCell`, division | primitive | `crates/genos-cell`, tests crate | appel par un chemin mission avec reçu |
| Génome, mutations, crossover | primitive | `crates/genos-genome`, tests crate | replay de lignée via runtime |
| Épigénétique | documentée → primitive partielle | `epigenome.rs`, tests crate | lien prouvé avec expression réelle des capacités |
| Métabolisme `MetabolicPool` | primitive | `autopoiesis.rs`, tick cellulaire | registre commun + enforcement aux points d'exécution |
| Homéostasie | primitive → intégrée partielle | `homeostasisService.js` évalue les contrats de mission et écrit les états dans `homeostasis_states`; `migrateHomeostasisStates.js` conserve maintenant l'historique aux redémarrages/migrations | registre commun avec le métabolisme; seuils configurables au-delà de `minimumFunctionalCoverage`; persistance/versionnement du contrat et reçu de transition relié à la mission |
| Neurobiologie, glie, quorum | primitive | modules biology + tests | lien aux événements réels de mission |
| Instinct PAF | primitive | `instinct/tests.rs` | chemin stimulus → PAF → action permise → reçu |
| Sens VNO, électro, Cluster N, tectum, écho | primitive | modules `sensory/*`, tests locaux | adaptateurs concrets ou typage « signal synthétique » |
| Immunité, pathologie, thérapie | primitive | tests cliniques `genos-biology/src/lib.rs` | application à des points réels + quarantaine bloquante |
| Écologie, tissus, spores | primitive | modules biology | registre de population durable + provenance |
| Reproduction, fossilisation | primitive | `genos-reproduction`, `fossil.rs` | événement versionné parent/seed/mutations/empreintes |
| Cnidocyte | primitive | `cnidocyte.rs`, tests locaux | filtre branché à un point d'entrée réel + latence mesurée |
| Électrocyte | primitive | `electrocyte.rs`, tests locaux | quorum multi-participants avec timeouts |
| Choanocyte | primitive | `choanocyte.rs`, tests locaux | adaptateur de flux + débit/pertes mesurés |
| Iridophore | primitive | `iridophore.rs`, tests locaux | rendus conformes ; camouflage non cryptographique |
| Cellule de garde | primitive | `guard_cell.rs`, tests locaux | branchement sur registre de ressources |
| Trachéide | primitive | `tracheid.rs`, tests locaux | artefact compilé réel + comparaison de coût |
| Procaryote / HGT | primitive | `prokaryote.rs`, tests locaux | transfert validé sous lease + révocation |
| Organisme de mission | documentée → intégrée partielle | orchestrateur + store, snapshots | continuité après redémarrage prouvée |
| Foraging web, fovéation | primitive (simulation) | services backend, tests isolés | boucle perception-action, voir `web-foraging.md` |

Aucune capacité ci-dessus n'est « validée » au sens bout en bout avec
artefacts conservés, à l'exception des primitives locales déjà couvertes par
`cargo test`. Les documents qui annonçaient « Implémenté » pour les
cellules spécialisées et les super-sens sont corrigés en « primitive ».

## 3. Règle anti-surpromesse

- Un calcul de tension n'est pas un consensus distribué.
- Un identifiant de pipeline ne signifie pas qu'un pipeline est compilé.
- Une constante `latency_micros: 2` n'est pas une latence mesurée.
- Un chiffrement par décalage n'est pas une garantie cryptographique.
- Un `PATCH_DEPARTURE` calculé ne prouve pas une navigation.
- Une lease autorise un appel ; elle ne prouve pas une boucle intégrée.

## Voir aussi

- [inventaire-biologique.md](inventaire-biologique.md) — chemins de code.
- [cellulaire-specialise.md](cellulaire-specialise.md) — limites détaillées.
- [sens-animaux.md](sens-animaux.md) — limites détaillées.
