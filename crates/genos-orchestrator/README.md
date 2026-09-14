# genos-orchestrator

Noyau **biomimétique** de GenOS : coordination d'agents, décision autonome,
perception, diagnostic et résilience. Le crate expose une façade unique
(`GenosEcosystem`) donnant accès à l'ensemble des crates bibliothèques de GenOS,
et une **boucle cognitive** (`tick` / `run`) qui observe, décide, agit et
apprend.

## Ce que fait le crate

- **Coordination** : tissus, cellules, délégation (desmosomes), conscience
  (dissonance/apoptose), immunité clonale, écologie anti-collusion
  (`BiomimeticOrchestrator`).
- **Décision autonome** : le `Director` choisit les *concepts* pertinents, les
  explore, apprend de ses succès/échecs et change de stratégie.
- **Organisation** : les **19 topologies** de GenOS (`organization.rs`) et les
  formes supérieures (holobionte, syncytium, métapopulation, rhizome, biocénose,
  biome, essaim).
- **Mondes parallèles** : Trinity (Basic / Planned / Self-Correcting) comparé sur
  des états isolés, avec barrière de preuve (`worlds.rs`).
- **Perception** : `observe()` construit l'état du monde depuis l'écosystème réel.
- **Recrutement** : décision par rôles/capacités, budget et détection
  d'imposteurs (`recruitment.rs`).
- **Diagnostic** : traces d'actions → replay → verdict (soin, famine, plasmide,
  mutation, croisement, suppression) (`trace.rs`, `diagnostics.rs`).
- **Génétique** : mutation, croisement, ADN leurre, plasmides-compétences.
- **Résilience** : sporulation/germination, redondance, régénération cyber.
- **Communication** : signalisation sans prompt (stigmergie, quorum, neuro) et
  consultation du **thalamus/LLM** (feature `api`).

## Démarrage rapide

```rust
use genos_orchestrator::{GenosEcosystem, Goal};

let mut eco = GenosEcosystem::new("Griot_Prime");

// Boucle complète jusqu'à l'arrêt.
let report = eco.run(&Goal::SecurePerimeter, 8);
println!("ticks={} atteint={} arret={:?}", report.ticks, report.reached, report.halt_reason);
```

Ou pas à pas :

```rust
use genos_orchestrator::{GenosEcosystem, Goal};

let mut eco = GenosEcosystem::new("Griot_Prime");
let state = eco.observe();                       // perception
let decision = eco.director.decide(&state, &Goal::SecurePerimeter); // décision
println!("strategie={:?} org={}", decision.strategy, decision.organization.name);
let tick = eco.tick(&Goal::SecurePerimeter);     // observe -> decide -> agit -> apprend
println!("{:?}", tick.executed);
```

## Boucle cognitive (`tick` / `run`)

1. **Observer** — `observe()` dérive un `WorldState` (tissus, agents, menace,
   malades, incertitude, traces, agents signalés, budget).
2. **Décider** — le `Director` retient une stratégie, un plan de concepts, une
   organisation et une forme d'ensemble.
3. **Agir** — chaque concept est exécuté sur l'écosystème.
4. **Apprendre** — succès/échec mettent à jour `ActionStats`.
5. **S'arrêter** — but atteint, budget épuisé, insoluble, arsenal épuisé.

`run(goal, max_ticks)` renvoie un `MissionReport`
(`ticks`, `halted`, `halt_reason`, `reached`, `executed`, `verdicts`,
`agents_before/after`, `traces`).

## Décision : directeur et concepts

24 concepts (`Concept`) avec préconditions/effets : `Observe`, `Replay`,
`Organize`, `Recruit`, `Delegate`, `Audit`, `Immune`, `Virology`, `Throttle`,
`Therapy`, `Spore`, `Glia`, `Signaling`, `Stigmergy`, `Quorum`, `Neuro`,
`Mutate`, `Cross`, `Endosymbiosis`, `Genomics`, `Plasmid`, `Feign`, `Kill`,
`Communicate`.

Stratégies : `Solo`, `ATeam`, `Biocenose`, `Biome`, `Trinity` (exploration en
parallèle si deux stratégies se valent). Buts : `SecurePerimeter`,
`RecoverAgent`, `RepairModule`.

```rust
let decision = eco.director.decide(&state, &Goal::SecurePerimeter);
for step in &decision.steps {
    println!("{:?} (utilite {:.2})", step.concept, step.utility);
}
```

### Stress, planification profonde, interprétation

- **Stress** : le `WorldState` agrège la dissonance, l'inflammation (IL‑6), le taux
  d'échec et la pression budgétaire (`stress`). Sous stress, le coût pèse davantage
  sur l'utilité et l'organisation bascule (ex. `network_silence`).
- **Planification profonde** : `plan_for` combine un préambule de stratégie et une
  **recherche en faisceau** (`beam_plan`, largeur selon la stratégie) sur `max_steps`,
  au lieu d'un simple choix glouton.
- **Interprétation sémantique** : `interpret_mission("...")` dérive le `Goal` et des
  contraintes (`budget_serre`, `urgence`, `autonomie_totale`) — via le thalamus si la
  feature `api` est active, sinon par mots‑clés. `run_mission(mission, max_ticks)`
  interprète puis exécute.

### Environnement incarné (Phase 1)

Première brique du « vivant » : une **boucle fermée** où l'orchestrateur perçoit un
monde externe, agit dessus et reçoit une **récompense externe**.

```rust
use genos_orchestrator::{Action, Environment, FileSandbox, GenosEcosystem};

let mut env = FileSandbox::new("sandbox")?;      // monde confiné (anti `..`)
env.act(Action::Write { path: "spec.txt".into(), content: "42\n".into() });
let mut eco = GenosEcosystem::new("Overmind");
let report = eco.embodied_task(&mut env, "spec.txt", "out.txt", 3);
assert!(report.success);
```

`trait Environment { sense(key) -> Percept; act(Action) -> Feedback }` ; `FileSandbox`
en est une implémentation réelle et confinée. Les issues sont enregistrées comme
concept `Actuate` (apprentissage externe) et dans le journal d'événements. Voir
`examples/mission_embodied.rs`.

### Buts endogènes (Phase 2)

L'orchestrateur peut choisir **lui‑même quoi poursuivre** à partir de *drives*
(déficits) — aucun `Goal` externe n'est requis :

```rust
use genos_orchestrator::GenosEcosystem;

let mut eco = GenosEcosystem::new("Overmind");
let drives = eco.drives();            // energie / integrite / curiosite
let goal = eco.autonomous_goal();     // derive du deficit (homeostasie)
let report = eco.run_autonomous(8);   // boucle, but recalcule a chaque tick
```

`Drives::from_state` dérive énergie (budget), intégrité (maladie/trahison/stress)
et curiosité (incertitude) ; `GoalSelector::select` en déduit `RecoverAgent`
(intégrité), `SecurePerimeter` (menace), `Conserve` (énergie basse) ou `Explore`
(curiosité). Les buts `Explore`/`Conserve` sont endogènes. Voir
`examples/mission_autonomous.rs`.

### Métabolisme réel (Phase 3)

L'ATP est une ressource **réelle** : elle se régénère avec le **temps** et se
consomme à chaque opération. La **famine bloque réellement** les actions.

```rust
let mut eco = GenosEcosystem::new("Overmind");
eco.orchestrator.metabolism.atp = 0.0;
let blocked = eco.embodied_task(&mut env, "spec.txt", "out.txt", 2);
assert!(!blocked.success);              // famine : ATP insuffisant
eco.feed(100.0);                        // repas
let ok = eco.embodied_task(&mut env, "spec.txt", "out.txt", 3);
assert!(ok.success);
```

`Metabolism` (sur l'orchestrateur) : `refill` (horloge réelle), `consume`
(débit d'une action), `feed` (ingestion), `is_starved`. Le budget observé
(`WorldState.budget`) est l'ATP réel, donc le directeur s'arrête vraiment en
famine. Voir `examples/mission_metabolism.rs`.

### Apprentissage (Phase 4)

Les statistiques sont remplacées par un **bandit contextuel linéaire** par
concept : la récompense attendue est `P(succès | contexte)` (menace, maladie,
stress, adversaire…), mise à jour en ligne et **propagée** aux concepts du plan
(assignation de crédit). L'expérience persiste et se **transfère** entre
missions.

```rust
director.set_context(context_from_state(&state));
director.record(Concept::Virology, true);   // apprentissage contextuel
let p = director.learner.predict(Concept::Virology, &context); // ~1.0
director.assign_credit(&[Concept::Observe, Concept::Recruit], 1.0);
```

`Learner`/`LinearBandit` (`src/learning.rs`) ; `context_from_state` extrait un
vecteur de 8 features. Voir `examples/mission_learning.rs`.

## Organisations et mondes

```rust
use genos_orchestrator::{catalog, select_organization, select_superorganism};

assert_eq!(catalog().len(), 19);
let org = select_organization(&state, &Goal::SecurePerimeter);
let supra = select_superorganism(&state, &Goal::SecurePerimeter);
```

```rust
use genos_orchestrator::Multiverse;

let result = Multiverse::trinity(&Goal::SecurePerimeter, &state);
if let Some(winner) = result.winner() {
    println!("monde promu : {} -> {:?}", winner.hypothesis.name(), winner.steps);
} else {
    println!("escalade : {}", result.reason);
}
```

## Recrutement

```rust
use genos_orchestrator::{Candidate, Demand, RecruitmentPlanner};

let candidates = vec![Candidate {
    id: "CnidocyteGuard".into(),
    role: "sentinel".into(),
    capabilities: vec!["interception".into()],
    proven: vec!["interception".into()],
    cost: 8.0,
}];
let demand = Demand { roles: vec!["sentinel".into()], capabilities: vec![], budget: 100.0 };
let decision = RecruitmentPlanner::new(8, 0.25).plan(&demand, &candidates);
assert!(decision.feasible);
```

## Diagnostic : traces, replay, verdicts, plasmides

```rust
use genos_orchestrator::{Outcome, Verdict};

eco.record_action(agent_id, "compile", Outcome::Success);
eco.record_action(agent_id, "crash", Outcome::Failure);

let report = eco.replay_agent(agent_id);
let verdict = eco.diagnose_agent(agent_id);
assert_eq!(verdict, Verdict::NeedsMutation);

let (_, note) = eco.act_on_verdict(agent_id); // soin/famine/plasmide/suppression...
eco.save_traces("traces.json")?;              // provenance persistée
```

## Génétique et comportements

```rust
use genos_orchestrator::Skill;

eco.register_dna(agent_id, dna);          // AgentDna (dna_ops::decode/…)
eco.mutate_agent(agent_id);               // mutation sur l'ADN enregistré
eco.crossover_agent(agent_id);            // croisement avec un partenaire
eco.feign(agent_id);                      // ADN leurre (decoy)
eco.execute_skill(agent_id, Skill::Repair);
let _ = eco.glial_pass();                 // pipeline glial complet
let _reply = eco.communicate("Ping");     // thalamus si feature `api`, sinon repli
```

## Accès complet à GenOS

`GenosEcosystem` compose l'ensemble des crates bibliothèques : signalisation,
stockage (événements, capsules, cryptobiose, mémoire vectorielle, fossiles),
reproduction, phénotype/quorum, sensorimoteur, thérapies/pathologie, glie,
cellules spécialisées, virologie, immunité cyber, sens avancés, phylogenèse,
ADN compilé, recrutement. Tous les crates sont aussi ré-exportés à la racine :

```rust
use genos_orchestrator::{genos_biology, genos_store, genos_signal, genos_dna};
```

La couche serveur (`genos-api`) est accessible via la feature Cargo `api`
(désactivée par défaut) :

```toml
genos-orchestrator = { path = "../genos-orchestrator", features = ["api"] }
```

```rust
use genos_orchestrator::api::{RateLimiter, TenantAuth, ChatMessage};
```

## Modules

| Module | Rôle |
|---|---|
| `orchestrator` | `BiomimeticOrchestrator` (tissus, conscience, spores, immunité) |
| `conscience` | Modèle d'évaluation cognitive |
| `director` | Directeur (choix de concepts, stratégies, apprentissage) |
| `planner` | `WorldState`, `Concept`, `Goal` |
| `organization` | 19 organisations + formes supérieures |
| `worlds` | Mondes parallèles (Trinity) et barrière de preuve |
| `observer` | Observation live → `WorldState` |
| `tick` | Boucle `tick`/`run`, `TickReport`, `MissionReport` |
| `recruitment` | Décision de recrutement |
| `trace` | Traces d'actions, replay, verdicts |
| `diagnostics` | Diagnostic, actions sur verdict, provenance persistée |
| `plasmids` | Banque de plasmides et compétences |
| `dna_ops` / `genome_ops` | ADN compilé et opérations génomiques |
| `ecosystem` | Façade `GenosEcosystem` |
| `environment` | Environnement incarné (`Environment`, `FileSandbox`, boucle perception→action→récompense) |
| `drives` | Buts endogènes (`Drives`, `GoalSelector`, `run_autonomous`) |
| `metabolism` | Métabolisme réel (`Metabolism` : ATP, famine, `feed`) |
| `learning` | Apprentissage (`Learner`, `LinearBandit` contextuel, crédit) |
| `neuro`, `virology`, `signaling`, `sensory`, `phylogeny`, `immune_cyber`, `snapshots`, `sensorimotor`, `thalamus` | Accès aux domaines |
| `token_bucket` | Ordonnanceur de calcul (quotas, famine, apoptose) |

## Exemples

```bash
cargo run -p genos-orchestrator --example mission_tick        # boucle cognitive
cargo run -p genos-orchestrator --example mission_embodied    # boucle incarnée (environnement)
cargo run -p genos-orchestrator --example mission_autonomous  # buts endogènes (drives)
cargo run -p genos-orchestrator --example mission_metabolism  # famine / régénération / feed
cargo run -p genos-orchestrator --example mission_learning    # bandit contextuel / transfert
cargo run -p genos-orchestrator --example mission_e2e         # bout en bout (feinte/glie/thalamus)
cargo run -p genos-orchestrator --example mission_trinity     # mondes parallèles
cargo run -p genos-orchestrator --example mission_recruit_planner # recrutement autonome
cargo run -p genos-orchestrator --example mission_replay      # replay -> destin
cargo run -p genos-orchestrator --example mission_repair      # mission de réparation
cargo run -p genos-orchestrator --example orchestrator_licence # 17 concepts
```

20 exemples au total couvrant maths (`licence_math` → `nobel_math`), français
(`licence_francais` → `goncourt_francais`), informatique (`licence_info` →
`turing_info`) et missions (`mission_*`).

## Tests

```bash
cargo test -p genos-orchestrator
cargo test -p genos-orchestrator --features api
cargo clippy -p genos-orchestrator --all-targets
```

## Notes et limites

- **Génétique** : les agents recrutés reçoivent **automatiquement** un ADN ; les
  agents préexistants doivent être enregistrés (`register_dna`) pour la
  mutation/croisement/feinte.
- **Mondes parallèles** : `Multiverse::run_isolated` exécute chaque hypothèse
  dans son **propre `GenosEcosystem`**, en **threads parallèles**, avec barrière
  de preuve. Les variantes `run`/`trinity` planifient sur des copies d'état
  (plus rapides, sans I/O).
- **Dialogue/LLM** : la compréhension sémantique et le dialogue humain relèvent
  du LLM (thalamus via la feature `api`) ; l'orchestrateur fournit la boucle de
  contrôle et la sélection de capacités. `communicate` fonctionne hors ligne
  (`"Ping"`).
- **Périmètre** : `genos-api` est accessible via la feature Cargo `api` ;
  `genos-mcp` et `genos-cli` sont des binaires, hors du noyau.
- La garantie de **cohérence simulation/réalité** est assurée par des tests de
  bout en bout (`mission_e2e`) : soins, quarantaine et neutralisation agissent
  réellement sur l'écosystème.
