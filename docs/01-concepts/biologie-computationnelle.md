# Biologie computationnelle dans GenOS

- **Statut** : Partiel — le tick Rust émet maintenant un reçu local versionné et l'homéostasie backend conserve contrats et transitions; le raccord durable mission-cellule-génome-coût-résultat entre les deux runtimes reste incomplet.
- **Portée** : `crates/genos-cell/src/lib.rs` (`AgentCell`, `Organelle`), `crates/genos-biology/src/embryology.rs` (`seed_hox_genome`), `crates/genos-genome/*`, `crates/genos-reproduction/*`, `backend/src/services/missionOrganismService.js`.
- **Dernière revue** : 2026-09-30.

## 1. Définition du domaine

La biologie computationnelle GenOS modélise un agent comme une cellule : génome (instructions), organites (budgets ATP, lysosome, mitochondrie), membrane/sandbox (confinement) et lignée (filiation mitose/bourgeonnement/méiose). Le vocabulaire biologique sert à organiser des invariants de runtime, pas à simuler du vivant.

## 2. Modèle logique

Les symboles ci-dessous sont un **résumé conceptuel**, pas une équation de
viabilité utilisée uniformément par le runtime. Les seuils, champs disponibles
et décisions effectives dépendent du service concerné; une propriété ne doit
être dite garantie que si son invariant est imposé dans le code et couvert par
un test correspondant.

À titre de modèle abstrait, on peut représenter une condition de poursuite par
`budget disponible ∧ confinement valide ∧ gates satisfaites`. Ce prédicat ne
constitue pas une définition biologique de la viabilité et n'implique pas que
tous les composants GenOS vérifient ces trois conditions.

## 3. Analogies biologiques et limites réelles

- cellule / organite = agent + budgets ; dystrophine = ancrage sandbox ; mitose = fork versionné.
- Limite : pas de biophysique réelle. Les références à Hayflick, Nernst ou Kuramoto désignent au mieux des inspirations ou heuristiques; elles ne sont pas des mesures physiologiques ni des simulations validées.

## 4. Cas d'usage

Usages visés : différenciation logicielle de rôles (HOX), routage inspiré du
foraging (Biome), isolation d'une branche défaillante et gestion bornée de
lignées. Chaque comportement doit être confirmé dans le composant qui le porte;
les noms apoptose et Hayflick restent analogiques.

## 5. Chemins de mission et preuves disponibles

Le backend démarre une mission par `agentRuntimeAdapter/missionExecution.js` : le bootstrap normalise `executionBudget`, vérifie sa cohérence et transmet le budget au superviseur/runtime. Les événements du runtime et de l'orchestration sont des traces d'exécution; ils ne constituent pas à eux seuls un reçu biologique liant une cellule, un génome et une dépense.

`missionContinuityService.js` reconstruit un organisme à partir des agents persistés : les agents deviennent des cellules/tissus, l'objectif et le contrat deviennent le génome déclaratif de l'organisme, puis `homeostasisService.js` évalue ses invariants. `mission_organism_state` conserve cet état agrégé; ce génome déclaratif n'est pas le `Genome` Rust et les deux registres ne sont pas synchronisés.

Dans `GenosEcosystem::tick` (`crates/genos-orchestrator/src/tick.rs`), chaque concept planifié est débité de `Metabolism` avant son application; l'ATP insuffisant bloque l'étape et trace `STARVATION`. Le tick place un reçu `genos.biological-execution-receipt/v1` dans `TickReport.biological_receipts` et dans l'event store local. Il porte tick, opération, coût en `atp_token`, registre métabolique, issue et identifiant de mission si l'appelant l'a fourni avec `set_mission_id`. La portée `organism` signifie qu'aucune cellule exécutante ni aucun génome n'est attesté; ces identifiants restent explicitement absents. `tick_and_persist` peut écrire le reçu et le snapshot de population dans `BiologicalReceiptStore`, un journal append-only vérifié à la relecture. Cette API Rust ne remplace pas l'event store mémoire du `tick` normal et n'est pas appelée automatiquement par tous les chemins.

Le backend expose `POST /api/rust/biological-receipts`, protégé par authentification, permission `experiment:run` et appartenance en écriture au projet qui contient la mission. Il valide le contrat v1, rend l'écriture idempotente par `receipt_id` et lie le reçu au dernier état d'homéostasie connu. Si le reçu arrive avant le premier état, sa corrélation est complétée à la création de cet état. Aucun client Rust n'expédie encore automatiquement le journal vers cette API; l'authentification protège l'appelant HTTP, mais ne signe pas le reçu Rust. Le service conserve `cell_id` et `genome_id` comme absents pour les reçus `organism` et ne prétend pas qu'un snapshot de population révèle l'exécutant.

`embryology::seed_hox_genome` assigne gènes et rôles selon ses règles de différenciation; ce n'est pas une simulation d'un gradient embryonnaire mesuré. `CellDivision::mitosis_attested` (`crates/genos-reproduction/src/division.rs`) applique les contrôles logiciels de division configurés; l'analogie avec une limite de Hayflick reste métaphorique.

## 6. Schéma

```mermaid
flowchart LR
    G[Genome Rust] -->|genome_id| C[AgentCell]
    T[GenosEcosystem tick] -->|concept + coût ATP| M[Metabolism ATP]
    C --> S[Sandbox membrane]
    C --> L[Lignage mitose/budding]
    M --> R[Reçu v1 dans TickReport et event store mémoire]
    L --> LT[Issue selon contrôles du composant]
    B[Backend mission: executionBudget] --> X[Runtime supervise]
    X --> O[Organisme de continuité: agents + génome déclaratif]
    O --> H[homeostasis_states: évaluations persistées]
    H --> HC[Contrats immuables versionnés + reçus de transition]
    R -. corrélation durable cellule/génome manquante .-> HC
```

## 7. Architecture technique

- Rust : `genos-cell` (`AgentCell`, `clinical.rs`), `genos-genome` (`gene.rs`, `genome.rs`, `translation.rs`), `genos-biology` (`embryology.rs`, `neurobiology/`, `therapy.rs`), `genos-reproduction` (`division.rs`, `crossover.rs`).
- Node : `missionOrganismService.js`, `regenerationService.js`, `agentConscienceService.js`, `homeostasisService.js`.

## 8. Registres, budgets et homéostasie

Les budgets de mission backend, le registre métabolique Node (`metabolicStateService.js`), les réservations (`resourceReservationService.js`), le résumé métabolique de `missionOrganismService.js` et l'ATP de `GenosEcosystem` sont des états distincts. Le budget du runtime est normalisé et appliqué par ses gardes; le débit ATP Rust s'applique au tick. Il n'existe pas de registre commun garantissant qu'une allocation ou dépense dans un de ces plans est reflétée dans les autres.

L'homéostasie de mission écrit les évaluations dans `homeostasis_states` et conserve les révisions d'autorité dans `homeostasis_contract_revisions`. Leur empreinte exclut les métadonnées d'assemblage volatiles; un changement de contrat crée une nouvelle révision. `homeostasisPolicyService.js` centralise et borne `minimumFunctionalCoverage` dans la politique `genos.homeostasis-policy/v1`. Chaque appel à `transitionMissionToComplete` écrit un reçu `genos.homeostasis-transition-receipt/v1` dans `homeostasis_transition_receipts`, qu'il autorise ou refuse la transition; il référence la révision, son empreinte, la politique, l'état et les types de preuves présents. Les reçus Rust et backend restent deux registres séparés : aucun coût n'est converti et aucun reçu backend ne prétend connaître la cellule ou le génome du tick.

Le chemin embryogenèse HOX → `AgentCell` → `Metabolism` → consolidation/apoptose ou fossilisation décrit des composants de l'orchestrateur Rust. Il ne doit pas être présenté comme une séquence universellement exécutée par chaque mission backend.

## 9. Comparaison avec le marché

Cette fiche ne prétend pas établir une comparaison avec d'autres orchestrateurs ni l'absence de concurrents. Les termes de lignage, budget et gate décrivent des concepts dont le degré d'implémentation varie selon les composants; le statut ci-dessus et les tests associés délimitent les affirmations vérifiables.

## 10. Limites, garde-fous, non-objectifs

- Partiel : persistance inter-process incomplète, dormance non persistée (voir `continuite-mission.md`).
- Non-objectif : simulation biologique prédictive, conscience phénoménale.
- Règle : un transport réussi n'est pas une décision valide ; toute promotion exige preuves + gates.
