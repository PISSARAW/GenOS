# Division cellulaire dans GenOS : mitose, méiose, fission, bourgeonnement, schizogonie

Ce document mappe les modes de division cellulaire de la biologie sur les
primitives runtime de GenOS, avec leur cas d'usage prioritaire, leur
implémentation et leurs garanties. Conformément au contrat d'évidence du
projet (`PROJECT.md`), chaque primitive listée ici est implémentée et couverte
par des tests exécutables.

## Vue d'ensemble

| Biologie | Primitive GenOS | Cas d'usage prioritaire | Implémentation |
| --- | --- | --- | --- |
| Mitose | `mitotic_fork_capsules` | Exécution parallèle redondante + vote majoritaire sur clones attestés | `crates/genos-runtime/src/division/mitosis.rs` |
| Méiose | `breed_genomes` | Recombinaison génétique entre cohortes parentes (évolution) | `crates/genos-runtime/src/evolution/breeding.rs` |
| Scissiparité (fission binaire) | `binary_fission_capsules` | Scale-out élastique de workers légers | `crates/genos-runtime/src/division/fission.rs` |
| Bourgeonnement | `bud_capsule` | Délégation bornée à un sous-agent spécialisé (limite de Hayflick) | `crates/genos-runtime/src/division/budding.rs` |
| Schizogonie | `schizogonic_burst` | Fan-out spéculatif atomique de N hypothèses (style MCTS) | `crates/genos-runtime/src/division/schizogony.rs` |
| Amitose | **absent par conception** | — | Voir « L'amitose : anti-pattern assumé » |

## 1. Mitose — clones attestés

**Biologie.** Le fuseau mitotique garantit que chaque cellule fille reçoit une
copie fidèle du génome.

**GenOS.** Le couple snapshot + replay déterministe joue le rôle du fuseau.
`mitotic_fork_capsules(provider, store, parent, count)` crée `count` filles à
partir du snapshot monde du parent, puis produit une attestation par fille :

- `genome_identical` : génome strictement égal à celui du parent ;
- `logical_state_identical` : mémoire de travail, croyances, objectifs,
  souvenirs, état d'outils et budget identiques ;
- `integrity_verified` : sceau d'intégrité de la capsule vérifié après
  persistance (`AgentWorldCapsule::verify_integrity`).

Si l'attestation globale échoue, la commande CLI est en erreur ; en cas
d'échec intermédiaire (fork ou persistance), tout ce qui a été créé est détruit
ou annulé (rollback).

**Cas d'usage prioritaire.** Exécution parallèle redondante : lancer N copies
identiques et comparer les issues (vote majoritaire contre le non-déterminisme
des LLM, détection de flops). C'est aussi le prérequis des expériences
contrefactuelles : les branches divergent ensuite chacune avec sa propre
hypothèse.

**CLI.**

```
genos division mitosis <capsule_id> --count 3
```

Chaque clone hérite du budget complet du parent.

**Tests.** `division::tests::mitosis_produces_attested_clones_of_the_parent`.

## 2. Méiose — recombinaison de génomes

**Biologie.** Réduction chromosomique, crossing-over et ségrégation indépendante
produisent une descendance diversifiée à partir de deux parents.

**GenOS.** `breed_genomes(alice, bob, ...)` recombine les chromosomes/loci des
deux parents selon une stratégie (`RecombinationStrategy`, dont
`HomologousRecombination` et l'uniforme), applique des mutations lamarckiennes
et enregistre la mutation dans les métadonnées du génome enfant. Un seuil de
spéciation (`speciation_threshold`) refuse les croisements dont la distance
génétique est trop grande — l'analogue de l'isolement reproductif. La sélection
artificielle (`evolution/selection.rs`) boucle ensuite évaluer → sélectionner →
croiser.

**Cas d'usage prioritaire.** Évolution de populations d'agents : croiser un
parent fort sur une dimension politique (ex. `caution`) avec un parent fort sur
les drives (ex. `curiosity`), mesurer la descendance, conserver les meilleurs.

**CLI.**

```
genos agent breed --alice a.yaml --bob b.yaml --evidence traits.yaml --out child.yaml
```

**Tests.** `evolution::recombination_tests`, tests intégrés de `breeding.rs`,
et expérience de bout en bout `genos experiment heredity`.

## 3. Fission binaire — scale-out procaryote

**Biologie.** Les procaryotes se divisent vite et symétriquement : pas de noyau
lourd, pas d'appareil mitotique complexe.

**GenOS.** `binary_fission_capsules(provider, store, parent, count)` crée
`count` filles symétriques avec un profil « procaryote » :

- aucune métadonnée de branche ni hypothèse expérimentale ;
- le budget restant du parent est divisé également (`floor`) entre les filles ;
- refus si le budget ne peut pas financer au moins un pas par fille.

Les mondes restent des forks isolés du snapshot parent (la légèreté porte sur
le payload logique, jamais sur l'isolation).

**Cas d'usage prioritaire.** Scale-out élastique de sous-tâches indépendantes :
balayages map-reduce, vérifications par lots, collectes parallèles — là où un
fork eucaryote complet (avec hypothèse et attestation) serait superflu.

**CLI.**

```
genos division fission <capsule_id> --count 4
```

**Tests.** `division::tests::fission_splits_the_budget_and_strips_metadata`,
`division::tests::fission_refuses_a_budget_that_cannot_fund_all_daughters`.

## 4. Bourgeonnement — délégation asymétrique bornée

**Biologie.** La cellule mère garde sa taille ; le bourgeon reçoit moins de
cytoplasme. Chaque bourgeonnement laisse une cicatrice, et la limite de
Hayflick borne le nombre de divisions d'une cellule.

**GenOS.** `bud_capsule(provider, store, parent, spec, hayflick_limit)` :

- le parent n'est **pas modifié** : même état, même budget restant ;
- le bourgeon part avec un budget dédié réduit (`spec.bud_steps`) et une
  étiquette `bud:<label>` ;
- chaque bourgeon persisté compte comme une cicatrice : le registre scanne les
  capsules enfants (`relation = Fork`, bon parent, préfixe `bud:`) via
  `CapsuleStore::list_all_capsules` ;
- au-delà de `hayflick_limit` cicatrices (défaut : `DEFAULT_HAYFLICK_LIMIT =
  8`), la division est refusée.

**Cas d'usage prioritaire.** Délégation sûre : confier une sous-tâche étroite
(lint, résumé, vérification ponctuelle) à un sous-agent éphémère sans permettre
au parent de se multiplier sans contrôle — le risque classique des cascades de
spawn multi-agents.

**CLI.**

```
genos division bud <capsule_id> --label lint --steps 5 --max-buds 8
```

**Tests.** `division::tests::budding_leaves_the_parent_intact_and_counts_scars`,
`division::tests::hayflick_limit_blocks_runaway_budding`.

## 5. Schizogonie — fan-out spéculatif atomique

**Biologie.** Le noyau se divise plusieurs fois *avant* que la membrane ne se
sépare ; la cellule mère libère ensuite toutes ses filles simultanément
(ex. *Plasmodium* dans le globule rouge).

**GenOS.** `schizogonic_burst(provider, store, parent, specs)` suit les deux
phases biologiques :

1. **Divisions nucléaires internes** : toutes les filles sont dérivées et
   validées *en mémoire* (étiquettes uniques et non vides, budget finançable)
   avant qu'aucune ressource ne soit créée ;
2. **Libération** : les mondes sont forkés et les capsules persistées d'un seul
   mouvement, sous un `burst_id` commun. Tout échec pendant la libération annule
   tout ce qui a été créé : une bouffée a lieu entièrement ou pas du tout.
   Le budget du parent est réparti également entre les filles de la bouffée.

**Cas d'usage prioritaire.** Exploration spéculative de type MCTS : développer N
hypothèses depuis un même état en une transaction, laisser chaque fille vivre ou
mourir sur ses propres preuves. Complément direct du module MCTS documenté dans
`EPIC2_MCTS.md`.

**CLI.**

```
genos division schizogony <capsule_id> --branch "dfs=depth-first" --branch "bfs=breadth-first"
```

**Tests.**
`division::tests::schizogonic_burst_releases_every_branch_atomically`,
`division::tests::schizogonic_burst_rejects_duplicate_labels_before_creating_resources`.

## 6. L'amitose : anti-pattern assumé

L'amitose (division directe sans chromosomes visibles ni fuseau) répartit
l'ADN de façon aléatoire et non vérifiable. C'est précisément le mode de
défaillance que GenOS existe pour empêcher : une copie d'état sans garantie de
replay ni attestation d'intégrité.

**Décision d'architecture : l'amitose n'est volontairement pas implémentée.**
Aucune primitive de copie non vérifiable n'existe dans le runtime, et aucune ne
doit y être ajoutée. Si un besoin de récupération dégradée apparaissait un jour,
il devrait être exposé comme un mode explicitement marqué `non-replayable` dans
les métadonnées, jamais comme un fork ordinaire — conformément au contrat
d'évidence (`PROJECT.md`) qui interdit de présenter une isolation logique pour
autre chose que ce qu'elle est.

## Garanties transverses

- **Isolation** : toutes les divisions passent par `WorldProvider::fork` ;
  chaque fille dispose de son propre monde isolé, quel que soit son profil.
- **Atomicité** : mitose, fission et schizogonie détruisent/annulent tout ce
  qui a été créé en cas d'échec partiel ; le bourgeonnement ne touche jamais au
  parent avant succès complet.
- **Budgets** : mitose duplique le budget, fission et schizogonie le divisent
  uniformément (refus s'il ne peut financer ≥ 1 pas par fille),
  bourgeonnement alloue un budget dédié sans toucher à celui du parent.
- **Intégrité** : toute capsule persistée est scellée
  (`verify_integrity`) ; le store refuse une capsule au sceau invalide.
- **Traçabilité** : chaque fille référence son parent (`parent_capsule`) avec
  la relation `Fork` ; les modes sont distinguables par étiquette
  (`mitosis-N`, `burst:<label>`, `bud:<label>`) et par les rapports
  `DivisionReport { mode, ... }`.
