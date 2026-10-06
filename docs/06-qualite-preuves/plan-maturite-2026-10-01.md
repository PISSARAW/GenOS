# Référence et plan de maturité — 2026-10-01

> **Actualisation clinique — 2026-10-06.** Les résultats ci-dessous décrivent la campagne historique du 2026-10-01. Le catalogue comprend désormais 28 conditions et 48 opérateurs. Les 103 tests Rust ciblés, les contrôles Node et les limites globales sont consignés dans le [bilan nosologique actuel](validation-nosologie.md). La présence d’un reçu ne prouve une administration que si treatment_administered est vrai et le statut applied; notamment IntensiveCareFluids sans perfusion_deficit modifiable ne change pas last_treatment_applied. Le parcours HTTP → Rust complet n’est pas validé dans la campagne actuelle.


- Référence de départ : `052da9ea170103ccb3e0e7a5371bc12b617d967d`.
- Base du rapport précédent : `f17000e8`; seul le commit documentaire
  `052da9ea` suit cette révision. Les changements locaux sont distincts.
- Implémentation : branche `codex/maturite-preuves`, worktree isolé ; les quatre
  fichiers modifiés et les fichiers non suivis du checkout utilisateur ne sont
  pas inclus.

## Validation initiale

Sur le checkout utilisateur au début de l'audit : npm test (55 assertions),
cargo test --workspace, deux tests durable_receipts avec feature api, et tests
ciblés du pont biologique, mission continuity (17), clinique, promotion AEIS,
NCE/POET, foraging navigateur et planning-gap passent. Le profil complet
test:validation n'a pas été relancé lors de cet audit.

Python du runtime Codex a exécuté scripts/ci/check_code_quality.py : 359
violations, dont 143 au-delà du baseline. Cette observation porte sur l'arbre
local, pas uniquement sur HEAD. La dette ne sera pas masquée par une hausse du
baseline. La remise à zéro des dépassements constitue un chantier distinct.

## Sept commits et preuves de sortie

1. Référence et documentation : corriger les revendications, conserver les
   limites et séparer révision, changements locaux et résultats exécutés.
2. Défauts bornés : oracles sur les douze tâches, heuristique admissible,
   deadline globale du foraging et annulation des opérations tardives.
3. Identité et reçus : journal durable des chemins de tick, livraison
   récupérable et identité explicite sans attribuer une opération d'organisme
   à une cellule qui ne l'a pas exécutée. E2E Rust/HTTP/SQLite après restart.
4. Succession : autorité acquise avant lancement, invalidation de l'ancien
   détenteur, crashs intermédiaires et concurrence de processus distincts.
5. Clinique : cible durable, autorisation explicite, reçu d'application et
   refus sans cible/autorisation ; distinguer état Node et application Rust.
6. AEIS : confiance versionnée des vérificateurs exécutables, refus des types
   inconnus, attestations persistées et cas adverses. Les avis fournisseurs
   restent consultatifs.
7. POET : corrélation par exécution, arrêt à échéance, contenu du split isolé,
   artefact lié au snapshot et harness multi-graines de production.

Chaque lot exige ses tests ciblés, les gates du dépôt et une mention explicite
des preuves non exécutées. Un fournisseur absent ou un benchmark non exécuté
ne sera jamais remplacé par un résultat synthétique présenté comme réel.

## Lot 3 — preuve exécutée

Le driver `receipt_bridge` exécute un tick normal avec journal configuré.
`test_rust_receipt_process_e2e.js` lance un backend HTTP avec l'application
réelle et SQLite, ferme ce processus, produit un tick hors ligne (échec de
livraison explicite), relance un nouveau backend puis flush depuis un nouveau
processus Rust. Les identités et fingerprints persistent, et un second flush
ne duplique pas les reçus. Les opérations d'organisme restent sans attribution
cellulaire : le snapshot signé décrit la population après tick.

Reproduction : `cargo build -p genos-orchestrator --example receipt_bridge
--features api`, puis définir `GENOS_RECEIPT_TEST_BINARY` sur ce binaire et
exécuter `node backend/tests/test_rust_receipt_process_e2e.js`. Sur cet hôte
Windows, la limite PDB du linker exige `cargo rustc -p genos-orchestrator
--example receipt_bridge --features api -- -C debuginfo=0 -C link-arg=/DEBUG:NONE`.

## Lots 6 et 7 — preuves exécutées

Le lot 6 lie les digests AEIS au code déployé et signe les preuves des processus réellement exécutés. Le nouveau test utilise les adaptateurs de production pour exécuter deux fois la vraie suite du dépôt, puis relit l’assemblée signée dans un autre processus SQLite et refuse les altérations (ADR 0233, confiance AEIS).

Le lot 7 isole les tentatives POET, impose un fichier lié au snapshot, borne l’attente et fige la sélection avant le split tenu à l’écart. Le harness multi-graines a exécuté le runtime local de production avec Ollama sur six missions : 0/3 entraînement et 0/3 tenu à l’écart. Les échecs sont conservés ; aucun succès de généralisation n’est revendiqué. La famille reste synthétique et le chemin positif Codex n’est pas démontré (ADR 0234).

## Lots 2, 4 et 5 — preuves exécutées le 2026-10-01

Planification : `node backend/tests/search/test_planning_gap.js` affirme
l’optimalité GenOS sur les douze tâches via l’oracle BFS
(`planningGapOracle.js`, sans coupure). Mesuré : Blocksworld 2/2/8/6/8/6/16/6
(dont `bw-table-6` à 16) et TrapChain 8/10/8/13 ; heuristique TrapChain
admissible (distance ignorant les portes). Foraging :
`node backend/tests/test_foraging_deadline.js` impose l’échéance globale —
navigation annulée (page fermée, aucune observation tardive) et tâche image
tuée (aucun artefact tardif).

Succession : `node backend/tests/test_mission_succession_processes.js`
(« Two SQLite-backed processes: single executable successor, stale authority
blocked, reserved crash recovered ») — autorité réservée avant lancement,
perdant et ancien orchestrateur bloqués (`MISSION_AUTHORITY_STALE`), un seul
effet inscrit, réservation reprise après kill d’un processus.

Reçus et clinique :
`GENOS_RECEIPT_TEST_BINARY=<receipt_bridge.exe --features api>` puis
`node backend/tests/test_rust_receipt_process_e2e.js` — tick Rust vers HTTP
authentifié puis SQLite, backend fermé, tick hors ligne en échec explicite,
nouveau backend, retransmission puis déduplication au second flush, identités
cellule/empreintes génome conservées ; autorisation clinique explicite vers
mutation Rust (`last_treatment_applied`), signature forgée/expirée/cellule
inconnue refusées, rejeu sans réapplication, reçu
`genos.clinical-application/v1` durable. AEIS :
`node backend/tests/test_aeis_production_adapters.js` (suite réelle, preuves
signées multi-processus, refus des altérations) et
`node backend/tests/test_approve_run_deferred_promotion.js` (rejet sans
signature, deux reçus indépendants acceptés).

Porte qualité ce jour : 356 violations (140 nouvelles), hors apport de ces
lots ; la remise à zéro reste un chantier distinct, sans relèvement du
baseline.
