# Noyau de contrôle morphogénétique (orchestrateur Rust)

- **Statut** : Intégré au runtime Node avec vérification Rust indépendante
- **Portée** : `crates/genos-orchestrator/src/kernel_*.rs`, `crates/genos-cli/src/commands/kernel_runtime.rs`, `crates/genos-orchestrator/tests/kernel_*.rs`
- **Dernière revue** : 2026-10-16

L'orchestrateur n'est plus pensé comme un gros agent qui réfléchit mieux que
les workers. Il fonctionne comme **système nerveux central + kernel de
contrôle** : il observe l'état global, maintient le modèle du collectif,
choisit la morphologie, délègue aux bons types d'agents sous contraintes,
puis réévalue selon les preuves. Voir [ADR 0045](../adr/0045-noyau-controle-morphogenetique.md).

## 1. Définition du domaine

Le kernel ne résout pas le problème lui-même. Il décide **quoi doit exister,
qui fait quoi, sous quelle forme, avec quelles contraintes, et quand
changer**. Il maintient un `OrchestratorState`
(`kernel_state.rs`) : mission, environnement, collectif (membres,
sous-graphes, topologie, physiologie, santé), épistémique, ressources,
cognition, capacités, procédures, modèles, gouvernance, résilience,
historique.

## 2. Modèle logique

```text
OBSERVE → UNDERSTAND → DIAGNOSE → DECIDE → PLAN → GOVERN → APPLY
  → DELEGATE → COLLECT → UPDATE → REEVALUATE (boucle)
```

Règle centrale : **diagnostiquer avant de changer la topologie**. La cause
est classée (`kernel_diagnosis.rs` : épistémique, cognitive, stratégique,
capacité, modèle, ressource, communication, topologie, procédurale,
pathologique, environnementale) et chaque classe impose une réponse
(preuve manquante → vérifieur, monoculture → recette cognitive différente,
famine ressource → réduction de topologie, dérive → reprofilage).

## 3. Analogies biologiques et limites réelles

Le vocabulaire (morphogenèse, physiologie, incarnation) est une métaphore de
conception : le code applique des règles déterministes, pas un développement
embryonnaire réel. Ne pas présenter ces termes comme des garanties
biologiques.

## 4. Cas d'usage intégré

Mission multi-domaines (backend, sécurité, recherche) avec budgets bornés :
le kernel arbitre les propositions des résolveurs, produit un
`MorphogenesisPlan` explicable avec rollback et le fait valider par la
gouvernance. `genos run <mission>` transmet ce plan et un identifiant de mission
au runtime Node réel, qui lance son orchestrateur et ses workers configurés.
Après la fermeture du runtime, un **second processus Rust** ouvre SQLite en
lecture seule et vérifie la mission sans consommer le rapport stdout de Node.
Le `KernelMissionReport` ne devient `verified: true` qu'après ce contrôle.

## 5. Exemples concrets

- Contradiction non résolue → `EpistemicResolver` propose `spawn_verifier`,
  incarné via `AgentIncarnationService` avec modèle indépendant.
- Gain attendu < 0,15 ou cooldown < 30 s → décision `NO_CHANGE` avec raison
  chiffrée (pas de flapping morphologique).
- Risque > 0,85 ou mode dégradé + plan coûteux → gouvernance refuse,
  approbation humaine requise.

## 6. Schéma

```text
Observations structurées → OrchestratorState → Diagnosis
  → ProposalSet (résolveurs) → MorphogenesisPlan (+ hystérésis)
  → GovernancePlane → Snapshot → AgentIncarnationService
  → observations → révision épistémique → repère mémoire → MissionReport
```

## 7. Architecture technique

| Module | Rôle |
| --- | --- |
| `kernel_state.rs` | `OrchestratorState`, intégration des observations |
| `kernel_diagnosis.rs` | classification causale |
| `kernel_resolvers.rs` | propositions (jamais d'actions directes) |
| `kernel_morphogenesis.rs` | plan + hystérésis |
| `kernel_incarnation.rs` | point unique de création, 4 niveaux d'autonomie, enveloppes de sous-orchestrateurs |
| `kernel_governance.rs` | validation pré-application |
| `kernel_cycle.rs` | `ControlKernel::step`, santé collective, diversité, rapports |
| `kernel_runtime_verifier.rs` | vérification indépendante et fail-closed des preuves SQLite |
| `genos-cli/commands/kernel_runtime.rs` | lancement mission Node puis second processus vérifieur Rust |

La décision reste déterministe en Rust. L'exécution est déléguée au runtime
Node de production et utilise son fournisseur configuré, ses workspaces et ses
workers. L'incarnation en mémoire demeure la prévision du kernel ; les
identités effectives du rapport sont remplacées par les identités workers
relues dans la base durable.

## 8. Processus d'exécution et de validation

1. `ControlKernel::step(observations)` intègre, diagnostique, résout,
   planifie et applique la gouvernance locale.
2. La CLI lance `backend/bin/genos-orchestrate.cjs` avec le plan Rust, une
   identité de mission stable et l'obligation de preuve avant promotion.
3. Le processus Node doit terminer la mission et persister au moins un worker,
   son run, ses observations, son reçu biologique et la transition
   homéostatique autorisée.
4. Un second processus Rust ouvre la base avec `SQLITE_OPEN_READ_ONLY`, recalcule
   les hashes, vérifie les liaisons mission/worker/run/budget et exige que tous
   les reçus workers figurent dans la transition homéostatique.
5. Gate qualité : 0 violation sur ces fichiers (400 lignes, 3 paramètres,
   complexité ≤ 10).

Le rapport en mémoire conserve `verified: false`. Seul
`ControlKernel::verified_report`, qui exige un `MissionVerification` produit
par le lecteur durable, peut émettre `verified: true`. Toute absence de worker,
preuve, budget satisfait, état homéostatique ou liaison de hash échoue fermement.

## 9. Comparaison avec le marché

Contrairement aux orchestrateurs à prompt unique, la décision collective est
décomposée (résolveurs), explicable (plan versionné) et bornée (autorité,
baux, hystérésis), au prix d'une machinerie plus lourde pour les missions
simples.

## 10. Limites, garde-fous, non-objectifs

- Les résolveurs restent à règles et les contrefactuels F0/F1/FN ne sont pas
  encore câblés au moteur VFS ; ces extensions ne conditionnent plus le
  lancement ni la vérification d'une mission Node ordinaire.
- `BiomimeticOrchestrator` historique coexiste : convergence à traiter.
- Non-objectifs : remplacer le control plane Node, appeler un LLM par
  défaut, garantir l'optimalité des choix morphologiques.
- Une exécution exige toujours un fournisseur Node effectivement configuré ;
  l'intégration logicielle ne prouve pas la disponibilité d'un fournisseur
  externe particulier.

## 11. État du runtime morphogénétique v2

Le runtime Node v2 orchestre désormais une décision en plusieurs étapes :
validation de la proposition, évaluation des contraintes et du coût,
adjudication du noyau, autorisation, application de la transition et émission
d'un reçu d'observabilité. Une décision `NO_CHANGE` est une issue explicite
et ne déclenche pas de transition.

La commande `genos run <mission>` fournit désormais la composition de
production Rust–Node. Les adaptateurs injectés restent disponibles pour les
tests unitaires du runtime v2, mais la commande opérateur ne dépend plus d'un
adaptateur `kernel.adjudicate` fictif.

Les services de graphe, typage, évaluation, transitions, baux, reçus,
observabilité, Rhizome et Holobionte fournissent les composants du parcours.
Leur composition opérationnelle dépend encore des adaptateurs et des
services injectés. Les benchmarks non stationnaires définissent des scénarios
et des métriques comparables; aucun résultat ne doit être interprété comme
une supériorité mesurée tant que les baselines et les exécutions n'ont pas
été effectivement raccordées et rapportées.

Les vérifications automatisées couvrent les invariants, certaines
compositions, le contrat du benchmark et le noyau Rust. Elles étayent les
comportements testés, sans valoir preuve de déploiement intégré, d'optimalité
ou de performance en production.

## Voir aussi

- [ADR 0045](../adr/0045-noyau-controle-morphogenetique.md) — décision.
- [ADR 0038](../adr/0038-boucle-controle-cognitif-morphogenese.md) — boucle cognitive (runtime Node).
- [ADR 0040](../adr/0040-morphogenese-git-contrefactuel.md) — versionnage et contrefactuels.
- [corps-orchestrator.md](corps-orchestrator.md) — corps sensoriel côté Node.
