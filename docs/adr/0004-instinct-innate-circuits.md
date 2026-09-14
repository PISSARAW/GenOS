# ADR 0004 — Instinct : circuits innés, Patterns d'Action Fixes et modulation hormonale

- **Statut** : Proposé
- **Date** : 2026-09-14
- **Domaine** : Biomimétique, génome, neurobiologie, orchestration, sécurité, preuve
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : [docs/INSTINCT.md](../INSTINCT.md), [docs/GENOME_EPIGENETIQUE.md](../GENOME_EPIGENETIQUE.md), [docs/NEUROBIOLOGIE_PLASTICITE.md](../NEUROBIOLOGIE_PLASTICITE.md), [docs/BIOMIMICRY_ANIMAL_SENSES.md](../BIOMIMICRY_ANIMAL_SENSES.md), [adr/0001-agent-dna-binary-format.md](0001-agent-dna-binary-format.md), [.genos.md](../../.genos.md) (règle 5)

## Contexte

GenOS modélise déjà des comportements non délibérés, mais sans distinguer clairement les trois niveaux de la triade éthologique :

1. **Réflexe** — [`Cnidocyte`](../../crates/genos-biology/src/specialized_cells/cnidocyte.rs) (`eval_stimulus`, `discharge`, `reload` ATP) et réponse de Flehmen du [VNO](../../crates/genos-biology/src/sensory/vomeronasal.rs) : action **unique** et isolée.
2. **Apprentissage** — synapses, STDP et mémoire ([NEUROBIOLOGIE_PLASTICITE.md](../NEUROBIOLOGIE_PLASTICITE.md)) : création/renforcement de liaisons par l'expérience.
3. **Instinct** — **absent** en tant que concept explicite.

Les briques nécessaires existent pourtant déjà, dispersées :

- **Encodage inné** : `Gene.developmentally_locked` et `ChromatinState` ([gene.rs](../../crates/genos-genome/src/gene.rs)) modélisent un gène pré-câblé, transmissible.
- **Voie rapide** : le bypass cortical est déjà revendiqué (phéromones hors-contexte, [BIOMIMICRY_ANIMAL_SENSES.md](../BIOMIMICRY_ANIMAL_SENSES.md)).
- **PAF** : aucune structure de **séquence** stéréotypée n'existe ; seul `handle_behavior` (freeze/feign_death) approche le comportement inné, en un pas.
- **Modulation hormonale** : `StandardEndocrineSystem` ([methods.rs](../../crates/genos-core/src/orchestrator/methods.rs)) porte le cortisol ; `handle_endocrine` et `handle_neuromodulation` ([biomimicry_features.rs](../../crates/genos-cli/src/commands/biomimicry_features.rs)) listent ocytocine, adrénaline, dopamine (RPE).

Sans concept explicite, le risque est double : (a) **confusion sémantique** entre réflexe, instinct et habitude apprise, source d'ambiguïté dans les audits ; (b) **trou de sécurité** si un « comportement inné » non tracé court-circuitait les gates de preuve. La doctrine du dépôt exige qu'un terme biologique **organise des invariants** et ne masque pas une absence de preuve.

## Décision

Introduire l'**instinct** comme concept de premier ordre, défini comme un **programme comportemental inné, complet et stéréotypé**, verrouillé au développement, hérité à 100 %, déclenché par un **stimulus signe** via un **mécanisme déclencheur inné (IRM)**, et exécuté par un **Patron d'Action Fixe (PAF)** empruntant une **voie sous-corticale** avant toute délibération LLM.

1. **Nouveau module Rust** `crates/genos-biology/src/instinct/` : `SignStimulus`, `InnateReleasingMechanism`, `FixedActionPattern`, `InstinctProgram`, `InstinctLibrary`, `InstinctOutcome`. Découpé en fichiers pour respecter la limite de 400 lignes.
2. **Encodage génomique — Option A (phase 1)** : réutiliser `Gene` avec `developmentally_locked = true` et des loci `LOCUS_INSTINCT_*`. Aucun changement du format binaire `AgentDNA`.
3. **Hérédité stricte** : les instincts sont transmis à 100 % par `Genome::derive_child()`, exemptés de `mutate_stochastic`, de la méthylation et de la reprogrammation Yamanaka. Un instinct est un invariant de lignée.
4. **Modulation, pas réécriture** : les hormones/neuromodulateurs modulent le **seuil** (`θ_eff`) et le **gain** d'exécution, jamais la topologie du PAF. La dopamine (RPE) ajuste la probabilité de ré-exécution, pas le câblage.
5. **Branchement sur l'existant** : `StandardEndocrineSystem` pour la modulation ; sorties de `sensory/*` comme stimuli signes ; feature `instinct` dans `handle_bio_feature` et le tool MCP `genos_biomimicry`.
6. **Sécurité non négociable** : le bypass cortical **n'est pas** un bypass de la preuve. Un PAF ne peut déclencher que des outils de `tool_policy` déjà autorisés, sandboxés, tracés et budgétés ; l'arbitre de réalité et les approvals humaines restent au-dessus.
7. **Observabilité** : télémétrie `INSTINCT_TRIGGER`, `INSTINCT_COMPLETE`, `INSTINCT_INTERRUPT` (stimulus, seuil effectif, hormones, pas exécutés, veto éventuel).

Règles structurantes :

- **Distinction explicite** des trois niveaux : réflexe = `Cnidocyte` (mono-action), instinct = PAF (séquence), apprentissage = STDP (plasticité).
- **PAF fini et borné** : exécution jusqu'à complétion, interrompue par veto ; pas de boucle illimitée.
- **Respect du gate de code** : fonctions ≤ 3 paramètres (structs de contexte), complexité ≤ 10, fichiers ≤ 400 lignes (`scripts/ci/check_code_quality.py`).

## Alternatives considérées

| Option | Avantages | Inconvénients | Verdict |
| --- | --- | --- | --- |
| Ne rien formaliser ; réutiliser `handle_behavior` | zéro coût | confond réflexe/instinct/habitude, pas de séquence, pas d'hérédité ni d'audit | Rejeté |
| Section binaire `INST` dès la phase 1 | séparation nette des gènes appris | change le format `AgentDNA`, migration et ADR de format, coût immédiat | Différé (phase 2) |
| Modéliser l'instinct comme politique apprise | réutilise la mémoire existante | contredit l'innéité (l'instinct serait appris), brouille la triade | Rejeté |
| Encoder via `Gene` `developmentally_locked` + loci dédiés | aucun changement de format, hérédité et verrou déjà présents, minimal | sémantique moins explicite dans le binaire | **Retenu (phase 1)** |
| Nouveau moteur de comportement dédié | contrôle total | duplication de l'endocrinien, des capteurs et des outils | Rejeté |

## Conséquences

**Positives** : concept explicite et auditable ; réutilisation du génome verrouillé, des capteurs et de l'endocrinien ; réponse rapide sans coût token ; hérédité stable des comportements critiques ; séparation claire entre inné, réflexe et appris.

**Négatives** : nouveau module et nouvelle surface CLI/MCP à maintenir ; risque de multiplication de loci `LOCUS_INSTINCT_*` mal documentés ; nécessité de définir des seuils et des bornes propres à chaque instinct.

**Risques et garde-fous** : déclenchements en boucle → seuil, gain dopaminergique et fréquence bornés + télémétrie ; confusion avec un contournement de sécurité → interdiction stricte d'élargir `tool_policy`, passage obligé par l'arbitre de réalité ; « apprentissage » implicite → la dopamine ne modifie que le gain, jamais la topologie ; dérive de format → l'ajout d'une section `INST` fera l'objet d'un ADR séparé.

## Suivi

- Implémenter le module `crates/genos-biology/src/instinct/` avec ses tests unitaires (déclenchement sous/sur seuil, modulation hormonale, exécution complète et veto).
- Encoder un premier instinct de référence (`LOCUS_INSTINCT_FORAGE_RETURN`) et un agent `agents/biomimetique/instinct_*.agent.json`.
- Brancher la feature `instinct` dans `handle_bio_feature` (CLI) et dans le tool MCP `genos_biomimicry` ; aligner Rust/Node/bridge.
- Étendre la télémétrie d'observabilité et l'endocrinien aux hormones de soin et de territorialité.
- ADR ultérieure si la section binaire `INST` est introduite ou si un « instinct appris par renforcement » est proposé.

## Conformité

- `.genos.md` règle 5 (écart d'architecture sans ADR interdit) : satisfait par le présent document.
- `.genos.md` règles 1–4 (complexité, ≤ 3 paramètres, SOLID, ≤ 400 lignes) : imposées à l'implémentation via `scripts/ci/check_code_quality.py`.
- Les fichiers de documentation sont hors du périmètre du gate de qualité de code.

## Références de code

- `crates/genos-biology/src/specialized_cells/cnidocyte.rs`, `sensory/vomeronasal.rs`, `sensory/mod.rs`, `lib.rs`
- `crates/genos-genome/src/gene.rs`, `genome.rs` ; `crates/genos-dna/src/section.rs`
- `crates/genos-core/src/orchestrator/methods.rs` (`StandardEndocrineSystem`, `tick`)
- `crates/genos-cli/src/commands/biomimicry_features.rs` (`handle_bio_feature`, `handle_endocrine`, `handle_neuromodulation`)
- `crates/genos-mcp/src/tools.rs`, `crates/genos-mcp/src/executor.rs`
- `agents/biomimetique/cnidocyte_guard.agent.json`, `agents/biomimetique/vomeronasal_pheromone.agent.json`
- `docs/INSTINCT.md`, `docs/GENOME_EPIGENETIQUE.md`, `docs/NEUROBIOLOGIE_PLASTICITE.md`, `docs/BIOMIMICRY_ANIMAL_SENSES.md`
